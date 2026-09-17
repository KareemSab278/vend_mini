use rusqlite::{params, Connection, Result};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

const USER_DATA_FILE: &str = "ordering_system_users.db";

fn user_db_path() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned());
    let dir = PathBuf::from(home).join("data");
    let _ = fs::create_dir_all(&dir);
    dir.join(USER_DATA_FILE)
}

fn initialize_base_admin(conn: &Connection) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO users (tag_id, full_name, is_admin, balance) VALUES (lower(?1), ?2, 1, 0)",
        params!["admin", "Base Admin"],
    )?;
    Ok(())
}

fn ensure_user_database_schema() -> Result<()> {
    let conn = Connection::open(user_db_path())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS users (
            user_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            tag_id   TEXT    NOT NULL UNIQUE,
            full_name TEXT    NOT NULL,
            is_admin  BOOLEAN NOT NULL DEFAULT 0,
            balance   REAL    NOT NULL DEFAULT 0
        );",
    )?;
    // Initialize the base admin after creating the table
    initialize_base_admin(&conn)?;
    Ok(())
}

#[tauri::command]
pub fn initialize_user_database() -> Result<(), String> {
    ensure_user_database_schema()
        .map_err(|e| format!("User database initialization failed: {}", e))
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
    pub is_admin: bool,
    pub balance: f64,
}

#[allow(dead_code)]
pub fn new_user(tag_id: &str, full_name: &str, is_admin: bool, balance: f64) -> Result<()> {
    let conn = open_user_db()?;
    conn.execute(
        "INSERT INTO users (tag_id, full_name, is_admin, balance) VALUES (lower(?1), ?2, ?3, ?4)",
        params![tag_id, full_name, is_admin, balance],
    )?;
    Ok(())
}

#[allow(dead_code)]
pub fn search_users_by_name(name: &str) -> Result<Vec<User>> {
    let conn = open_user_db()?;
    let mut stmt = conn.prepare(
        "SELECT user_id, tag_id, full_name, is_admin, balance FROM users WHERE full_name LIKE ?1",
    )?;
    let user_iter = stmt.query_map(params![format!("%{}%", name)], |row| {
        Ok(User {
            user_id: row.get(0)?,
            tag_id: row.get(1)?,
            full_name: row.get(2)?,
            is_admin: row.get(3)?,
            balance: row.get(4)?,
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
        "SELECT user_id, tag_id, full_name, is_admin, balance FROM users WHERE tag_id = lower(?1)",
    )?;
    let user_iter = stmt.query_map(params![tag_id], |row| {
        Ok(User {
            user_id: row.get(0)?,
            tag_id: row.get(1)?,
            full_name: row.get(2)?,
            is_admin: row.get(3)?,
            balance: row.get(4)?,
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
    let mut stmt = conn.prepare("SELECT balance FROM users WHERE tag_id = lower(?1)")?;
    let balance_iter = stmt.query_map(params![tag_id], |row| row.get(0))?;

    for balance in balance_iter {
        return Ok(Some(balance?));
    }
    Ok(None)
}

#[allow(dead_code)]
pub fn get_all_admins() -> Result<Vec<User>> {
    let conn = open_user_db()?;
    let mut stmt = conn.prepare(
        "SELECT user_id, tag_id, full_name, is_admin, balance FROM users WHERE is_admin = 1",
    )?;
    let admin_iter = stmt.query_map([], |row| {
        Ok(User {
            user_id: row.get(0)?,
            tag_id: row.get(1)?,
            full_name: row.get(2)?,
            is_admin: row.get(3)?,
            balance: row.get(4)?,
        })
    })?;

    let mut admins = Vec::new();
    for admin in admin_iter {
        admins.push(admin?);
    }
    Ok(admins)
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
            "SELECT balance FROM users WHERE tag_id = lower(?1)",
            params![tag_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let new_balance = current_balance - amount;

    if new_balance < 0.0 {
        Err(format!("Insufficient balance: {}", current_balance))
    } else {
        conn.execute(
            "UPDATE users SET balance = ?1 WHERE tag_id = lower(?2)",
            params![new_balance, tag_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(new_balance)
    }
}

#[allow(dead_code)]
pub fn update_user_by_tag_id(
    tag_id: &str,
    full_name: &str,
    is_admin: bool,
    balance: f64,
) -> Result<()> {
    let conn = open_user_db()?;
    conn.execute(
        "UPDATE users SET full_name = ?1, is_admin = ?2, balance = ?3 WHERE tag_id = lower(?4)",
        params![full_name, is_admin, balance, tag_id],
    )?;
    Ok(())
}

#[allow(dead_code)]
pub fn delete_user_by_tag_id(tag_id: &str) -> Result<()> {
    let conn = open_user_db()?;
    conn.execute(
        "DELETE FROM users WHERE tag_id = lower(?1)",
        params![tag_id],
    )?;
    Ok(())
}
