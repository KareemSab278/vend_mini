use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

const USER_DATA_FILE: &str = "ordering_system_users.db";

fn user_db_path() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned());
    let dir = PathBuf::from(home).join("data");
    let _ = fs::create_dir_all(&dir);
    dir.join(USER_DATA_FILE)
}

fn ensure_user_database_schema() -> Result<()> {
    let conn = Connection::open(user_db_path())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS users (
            user_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            tag_id   TEXT    NOT NULL UNIQUE,
            full_name TEXT    NOT NULL,
            is_admin  BOOLEAN NOT NULL DEFAULT 0,
            balance   REAL    NOT NULL DEFAULT 0,
            failsafe  BOOLEAN NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS admin_login_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            failed_attempts INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO admin_login_state (id, failed_attempts) VALUES (1, 0);",
    )?;
    ensure_column(&conn, "username", "TEXT")?;
    ensure_column(&conn, "password_hash", "TEXT")?;
    ensure_column(&conn, "failsafe", "BOOLEAN NOT NULL DEFAULT 0")?;
    conn.execute("DROP INDEX IF EXISTS unique_admin_username", [])?;
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS unique_admin_username
         ON users (lower(username))
         WHERE (is_admin = 1 OR failsafe = 1) AND username IS NOT NULL",
        [],
    )?;
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS unique_failsafe_user
         ON users (failsafe) WHERE failsafe = 1",
        [],
    )?;
    Ok(())
}

fn ensure_column(conn: &Connection, name: &str, column_type: &str) -> Result<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(users)")?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for column in columns {
        if column? == name {
            return Ok(());
        }
    }
    conn.execute(
        &format!("ALTER TABLE users ADD COLUMN {name} {column_type}"),
        [],
    )?;
    Ok(())
}

#[tauri::command]
pub fn initialize_user_database() -> Result<(), String> {
    ensure_user_database_schema().map_err(|e| format!("User database initialization failed: {}", e))
}

fn open_user_db() -> Result<Connection> {
    ensure_user_database_schema()?;
    Connection::open(user_db_path())
}

#[derive(Serialize, Debug)]
#[allow(dead_code)]
pub struct User {
    pub user_id: u16,
    pub tag_id: String,
    pub full_name: String,
    pub username: String,
    pub is_admin: bool,
    pub balance: f64,
}

#[tauri::command]
pub async fn are_admins_present() -> Result<bool, String> {
    let conn = open_user_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT COUNT(*) FROM users WHERE is_admin = 1 AND failsafe = 0")
        .map_err(|e| e.to_string())?;
    let count: i64 = stmt
        .query_row([], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

#[derive(Deserialize, Debug, Clone)]
pub struct NewUser {
    pub tag_id: String,
    #[serde(default)]
    pub full_name: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    pub is_admin: bool,
    pub balance: f64,
}

#[derive(Deserialize, Debug)]
pub struct FailsafeCredentials {
    pub username: String,
    pub password: String,
}

#[tauri::command]
pub async fn are_failsafe_users_present() -> Result<bool, String> {
    let conn = open_user_db().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users WHERE failsafe = 1", [], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

#[tauri::command]
pub fn new_failsafe_user(credentials: FailsafeCredentials) -> Result<(), String> {
    let conn = open_user_db().map_err(|e| e.to_string())?;
    let username = non_empty(credentials.username)
        .ok_or_else(|| "Failsafe username is required".to_string())?;
    if username.len() < 3 {
        return Err("Failsafe username must be at least 3 characters".to_string());
    }
    let password_hash = hash_admin_password(Some(&username), Some(&credentials.password))?;
    conn.execute(
        "INSERT INTO users (tag_id, full_name, username, password_hash, is_admin, balance, failsafe)
         VALUES ('', ?1, ?1, ?2, 0, 0, 1)",
        params![username, password_hash],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn new_user(user: NewUser) -> Result<bool, String> {
    let conn = open_user_db().map_err(|e| e.to_string())?;
    let username = user.username.and_then(non_empty);
    let password_hash = if user.is_admin {
        Some(hash_admin_password(
            username.as_deref(),
            user.password.as_deref(),
        )?)
    } else {
        None
    };
    let full_name = user
        .full_name
        .and_then(non_empty)
        .or_else(|| username.clone())
        .unwrap_or_else(|| "User".to_string());
    conn.execute(
        "INSERT INTO users (tag_id, full_name, username, password_hash, is_admin, balance)
         VALUES (lower(?1), ?2, ?3, ?4, ?5, ?6)",
        params![
            user.tag_id,
            full_name,
            username,
            password_hash,
            user.is_admin,
            user.balance
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

fn non_empty(value: String) -> Option<String> {
    let value = value.trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn hash_admin_password(username: Option<&str>, password: Option<&str>) -> Result<String, String> {
    let username = username.ok_or_else(|| "Admin username is required".to_string())?;
    if username.len() < 3 {
        return Err("Admin username must be at least 3 characters".to_string());
    }
    let password = password.ok_or_else(|| "Admin password is required".to_string())?;
    if password.len() < 8 {
        return Err("Admin password must be at least 8 characters".to_string());
    }
    bcrypt::hash(password, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Failed to hash admin password: {e}"))
}

#[allow(dead_code)]
pub fn search_users_by_name(name: &str) -> Result<Vec<User>> {
    let conn = open_user_db()?;
    let mut stmt = conn.prepare(
        "SELECT user_id, tag_id, full_name, COALESCE(username, full_name), is_admin, balance
         FROM users WHERE failsafe = 0 AND COALESCE(username, full_name) LIKE ?1",
    )?;
    let user_iter = stmt.query_map(params![format!("%{}%", name)], |row| {
        Ok(User {
            user_id: row.get(0)?,
            tag_id: row.get(1)?,
            full_name: row.get(2)?,
            username: row.get(3)?,
            is_admin: row.get(4)?,
            balance: row.get(5)?,
        })
    })?;

    let mut users = Vec::new();
    for user in user_iter {
        users.push(user?);
    }
    Ok(users)
}

#[allow(dead_code)]
pub fn get_user_by_tag_id(tag_id: &str) -> Result<Option<User>> {
    let conn = open_user_db()?;
    let mut stmt = conn.prepare(
        "SELECT user_id, tag_id, full_name, COALESCE(username, full_name), is_admin, balance
         FROM users WHERE tag_id = lower(?1) AND failsafe = 0",
    )?;
    let user_iter = stmt.query_map(params![tag_id], |row| {
        Ok(User {
            user_id: row.get(0)?,
            tag_id: row.get(1)?,
            full_name: row.get(2)?,
            username: row.get(3)?,
            is_admin: row.get(4)?,
            balance: row.get(5)?,
        })
    })?;

    for user in user_iter {
        return Ok(Some(user?));
    }
    Ok(None)
}

#[tauri::command]
pub async fn get_balance_by_tag_id(tag_id: String) -> Result<Option<f64>, String> {
    fetch_balance_by_tag_id(&tag_id).map_err(|e| format!("Failed to get balance: {}", e))
}

#[allow(dead_code)]
pub fn fetch_balance_by_tag_id(tag_id: &str) -> Result<Option<f64>> {
    let conn = open_user_db()?;
    let mut stmt =
        conn.prepare("SELECT balance FROM users WHERE tag_id = lower(?1) AND failsafe = 0")?;
    let balance_iter = stmt.query_map(params![tag_id], |row| row.get(0))?;

    for balance in balance_iter {
        return Ok(Some(balance?));
    }
    Ok(None)
}

pub fn fetch_all_admins() -> Result<Vec<User>> {
    let conn = open_user_db()?;
    let mut stmt = conn.prepare(
        "SELECT user_id, tag_id, full_name, COALESCE(username, full_name), is_admin, balance
         FROM users WHERE is_admin = 1 AND failsafe = 0",
    )?;
    let admin_iter = stmt.query_map([], |row| {
        Ok(User {
            user_id: row.get(0)?,
            tag_id: row.get(1)?,
            full_name: row.get(2)?,
            username: row.get(3)?,
            is_admin: row.get(4)?,
            balance: row.get(5)?,
        })
    })?;

    let mut admins = Vec::new();
    for admin in admin_iter {
        admins.push(admin?);
    }
    Ok(admins)
}

#[tauri::command]
pub async fn get_all_admins() -> Result<Vec<User>, String> {
    fetch_all_admins().map_err(|e| e.to_string())
}

pub fn admin_login(username: String, password: String) -> Result<User, String> {
    let conn = open_user_db().map_err(|e| e.to_string())?;
    admin_login_with_connection(&conn, &username, &password)
}

fn admin_login_with_connection(
    conn: &Connection,
    username: &str,
    password: &str,
) -> Result<User, String> {
    const MAX_ATTEMPTS: i64 = 5;
    let failed_attempts: i64 = conn
        .query_row(
            "SELECT failed_attempts FROM admin_login_state WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if failed_attempts >= MAX_ATTEMPTS {
        return Err("Too many failed attempts. Scan an admin NFC tag to try again.".into());
    }

    let admin = conn
        .query_row(
            "SELECT user_id, tag_id, full_name, COALESCE(username, full_name), password_hash,
                    is_admin, balance
             FROM users
             WHERE (is_admin = 1 OR failsafe = 1) AND lower(username) = lower(?1)",
            params![username.trim()],
            |row| {
                Ok((
                    User {
                        user_id: row.get(0)?,
                        tag_id: row.get(1)?,
                        full_name: row.get(2)?,
                        username: row.get(3)?,
                        is_admin: row.get(5)?,
                        balance: row.get(6)?,
                    },
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .ok();

    if let Some((user, Some(password_hash))) = admin {
        if bcrypt::verify(password, &password_hash).map_err(|e| e.to_string())? {
            conn.execute(
                "UPDATE admin_login_state SET failed_attempts = 0 WHERE id = 1",
                [],
            )
            .map_err(|e| e.to_string())?;
            return Ok(user);
        }
    }

    conn.execute(
        "UPDATE admin_login_state SET failed_attempts = failed_attempts + 1 WHERE id = 1",
        [],
    )
    .map_err(|e| e.to_string())?;
    let attempts: i64 = conn
        .query_row(
            "SELECT failed_attempts FROM admin_login_state WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if attempts >= MAX_ATTEMPTS {
        Err("Too many failed attempts. Scan an admin NFC tag to try again.".into())
    } else {
        Err(format!(
            "Invalid username or password. {} attempts remaining.",
            MAX_ATTEMPTS - attempts
        ))
    }
}

pub fn reset_admin_login_attempts() -> Result<(), String> {
    let conn = open_user_db().map_err(|e| e.to_string())?;
    reset_admin_login_attempts_in_connection(&conn).map_err(|e| e.to_string())
}

fn reset_admin_login_attempts_in_connection(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE admin_login_state SET failed_attempts = 0 WHERE id = 1",
        [],
    )?;
    Ok(())
}

#[tauri::command]
pub fn update_admin_profile(
    user_id: u16,
    username: String,
    new_password: Option<String>,
    tag_id: String,
) -> Result<(), String> {
    let conn = open_user_db().map_err(|e| e.to_string())?;
    update_admin_profile_with_connection(&conn, user_id, &username, new_password, &tag_id)
}

fn update_admin_profile_with_connection(
    conn: &Connection,
    user_id: u16,
    username: &str,
    new_password: Option<String>,
    tag_id: &str,
) -> Result<(), String> {
    let username =
        non_empty(username.to_string()).ok_or_else(|| "Admin username is required".to_string())?;
    if username.len() < 3 {
        return Err("Admin username must be at least 3 characters".to_string());
    }
    let (current_tag_id, password_hash): (String, Option<String>) = conn
        .query_row(
            "SELECT tag_id, password_hash
             FROM users WHERE user_id = ?1 AND is_admin = 1 AND failsafe = 0",
            params![user_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Admin account not found: {e}"))?;
    let tag_id = if tag_id.trim().is_empty() {
        current_tag_id
    } else {
        tag_id.trim().to_lowercase()
    };
    if tag_id.is_empty() {
        return Err("Admin NFC tag ID cannot be empty".to_string());
    }

    let password_hash = if let Some(new_password) = new_password.and_then(non_empty) {
        Some(hash_admin_password(Some(&username), Some(&new_password))?)
    } else {
        Some(password_hash.ok_or_else(|| "Admin password is required".to_string())?)
    };
    conn.execute(
        "UPDATE users SET username = ?1, tag_id = ?2, password_hash = ?3
         WHERE user_id = ?4 AND is_admin = 1 AND failsafe = 0",
        params![username, tag_id, password_hash, user_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_balance_by_tag_id(tag_id: String, amount: f64) -> Result<f64, String> {
    deduct_balance_by_tag_id(&tag_id, amount)
}

#[allow(dead_code)]
pub fn deduct_balance_by_tag_id(tag_id: &str, amount: f64) -> std::result::Result<f64, String> {
    let conn = open_user_db().map_err(|e| e.to_string())?;
    let current_balance: f64 = conn
        .query_row(
            "SELECT balance FROM users WHERE tag_id = lower(?1) AND failsafe = 0",
            params![tag_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let new_balance = current_balance - amount;

    if new_balance < 0.0 {
        Err(format!("Insufficient balance: {}", current_balance))
    } else {
        conn.execute(
            "UPDATE users SET balance = ?1 WHERE tag_id = lower(?2) AND failsafe = 0",
            params![new_balance, tag_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(new_balance)
    }
}

#[allow(dead_code)]
pub fn update_user_by_tag_id(tag_id: &str, user: NewUser) -> std::result::Result<(), String> {
    let conn = open_user_db().map_err(|e| e.to_string())?;
    let existing = conn
        .query_row(
            "SELECT is_admin, password_hash FROM users
             WHERE tag_id = lower(?1) AND failsafe = 0",
            params![tag_id],
            |row| Ok((row.get::<_, bool>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let username = user.username.and_then(non_empty);
    if user.is_admin && username.is_none() {
        return Err("Admin username is required".to_string());
    }
    let password_hash = if user.is_admin {
        if let Some(password) = user
            .password
            .as_deref()
            .and_then(|p| non_empty(p.to_string()))
        {
            Some(bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?)
        } else if existing.0 {
            existing
                .1
                .ok_or_else(|| "Admin password is required".to_string())?
                .into()
        } else {
            return Err("Admin password is required".to_string());
        }
    } else {
        None
    };
    let full_name = user
        .full_name
        .and_then(non_empty)
        .or_else(|| username.clone())
        .unwrap_or_else(|| "User".to_string());
    conn.execute(
        "UPDATE users SET full_name = ?1, username = ?2, password_hash = ?3,
         is_admin = ?4, balance = ?5 WHERE tag_id = lower(?6) AND failsafe = 0",
        params![
            full_name,
            if user.is_admin { username } else { None },
            password_hash,
            user.is_admin,
            user.balance,
            tag_id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[allow(dead_code)]
pub fn delete_user_by_tag_id(tag_id: &str) -> Result<()> {
    let conn = open_user_db()?;
    conn.execute(
        "DELETE FROM users WHERE tag_id = lower(?1) AND failsafe = 0",
        params![tag_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        admin_login_with_connection, hash_admin_password, reset_admin_login_attempts_in_connection,
        update_admin_profile_with_connection,
    };
    use rusqlite::{params, Connection};

    fn admin_login_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory user database should open");
        conn.execute_batch(
            "CREATE TABLE users (
                user_id INTEGER PRIMARY KEY,
                tag_id TEXT NOT NULL,
                full_name TEXT NOT NULL,
                username TEXT,
                password_hash TEXT,
                is_admin BOOLEAN NOT NULL,
                balance REAL NOT NULL,
                failsafe BOOLEAN NOT NULL DEFAULT 0
            );
            CREATE TABLE admin_login_state (
                id INTEGER PRIMARY KEY,
                failed_attempts INTEGER NOT NULL
            );
            INSERT INTO admin_login_state (id, failed_attempts) VALUES (1, 0);",
        )
        .expect("test user schema should be created");
        let hash = bcrypt::hash("correct-password", bcrypt::DEFAULT_COST)
            .expect("test password should hash");
        conn.execute(
            "INSERT INTO users
             (user_id, tag_id, full_name, username, password_hash, is_admin, balance)
             VALUES (1, 'tag', 'Operator', 'operator', ?1, 1, 0)",
            params![hash],
        )
        .expect("test admin should be created");
        conn
    }

    #[test]
    fn admin_passwords_are_bcrypt_hashed_and_validated() {
        let hash = hash_admin_password(Some("operator"), Some("a-strong-password"))
            .expect("valid admin credentials should hash");

        assert_ne!(hash, "a-strong-password");
        assert!(bcrypt::verify("a-strong-password", &hash).expect("hash should verify"));
        assert!(hash_admin_password(Some("op"), Some("a-strong-password")).is_err());
        assert!(hash_admin_password(Some("operator"), Some("short")).is_err());
    }

    #[test]
    fn admin_login_accepts_the_stored_bcrypt_password() {
        let conn = admin_login_db();
        let admin = admin_login_with_connection(&conn, "OPERATOR", "correct-password")
            .expect("matching credentials should sign in");

        assert_eq!(admin.username, "operator");
    }

    #[test]
    fn failsafe_login_accepts_credentials_without_an_admin_tag() {
        let conn = admin_login_db();
        let hash = bcrypt::hash("failsafe-password", bcrypt::DEFAULT_COST)
            .expect("failsafe password should hash");
        conn.execute(
            "INSERT INTO users
             (tag_id, full_name, username, password_hash, is_admin, balance, failsafe)
             VALUES ('', 'Failsafe', 'private-user', ?1, 0, 0, 1)",
            params![hash],
        )
        .expect("failsafe user should be created without a tag id");

        let user = admin_login_with_connection(&conn, "private-user", "failsafe-password")
            .expect("failsafe credentials should sign in");

        assert_eq!(user.tag_id, "");
        assert!(!user.is_admin);
    }

    #[test]
    fn admin_login_locks_after_five_failures_until_nfc_reset() {
        let conn = admin_login_db();
        for _ in 0..5 {
            assert!(admin_login_with_connection(&conn, "operator", "wrong-password").is_err());
        }
        assert!(admin_login_with_connection(&conn, "operator", "correct-password").is_err());

        reset_admin_login_attempts_in_connection(&conn)
            .expect("admin NFC tag should reset failed attempts");
        assert!(admin_login_with_connection(&conn, "operator", "correct-password").is_ok());
    }

    #[test]
    fn scanned_legacy_admin_can_set_username_and_password() {
        let conn = admin_login_db();
        conn.execute(
            "UPDATE users SET username = NULL, password_hash = NULL WHERE user_id = 1",
            [],
        )
        .expect("legacy admin should be simulated");

        update_admin_profile_with_connection(
            &conn,
            1,
            "new-operator",
            Some("new-password".to_string()),
            "replacement-tag",
        )
        .expect("admin profile should be configurable after NFC access");

        let admin = admin_login_with_connection(&conn, "new-operator", "new-password")
            .expect("new credentials should sign in");
        assert_eq!(admin.tag_id, "replacement-tag");
    }
}
