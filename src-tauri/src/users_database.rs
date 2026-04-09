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


pub fn initialize_user_database() -> Result<()> {
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
    Ok(())
}

fn open_user_db() -> Result<Connection> {
    initialize_user_database()?;
    Connection::open(user_db_path())
}

#[derive(Serialize, Debug)]
pub struct User {
    pub user_id: u16,
    pub tag_id: String,
    pub full_name: String,
    pub is_admin: bool,
    pub balance: f64,
}

pub fn new_user(tag_id: &str, full_name: &str, is_admin: bool, balance: f64) -> Result<()> {
    let conn = open_user_db()?;
    conn.execute(
        "INSERT INTO users (tag_id, full_name, is_admin, balance) VALUES (?1, ?2, ?3, ?4)",
        params![tag_id, full_name, is_admin, balance],
    )?;
    Ok(())
}


pub fn search_users_by_name(name: &str) -> Result<Vec<User>> {
    let conn = open_user_db()?;
    let mut stmt = conn.prepare("SELECT user_id, tag_id, full_name, is_admin, balance FROM users WHERE full_name LIKE ?1")?;
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

pub fn get_user_by_tag_id(tag_id: &str) -> Result<Option<User>> {
    let conn = open_user_db()?;
    let mut stmt = conn.prepare("SELECT user_id, tag_id, full_name, is_admin, balance FROM users WHERE tag_id = ?1")?;
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

pub fn get_balance_by_tag_id(tag_id: &str) -> Result<Option<f64>> {
    let conn = open_user_db()?;
    let mut stmt = conn.prepare("SELECT balance FROM users WHERE tag_id = ?1")?;
    let balance_iter = stmt.query_map(params![tag_id], |row| row.get(0))?;

    for balance in balance_iter {
        return Ok(Some(balance?));
    }
    Ok(None)
}

pub fn update_balance_by_tag_id(tag_id: &str, new_balance: f64) -> Result<()> {
    let conn = open_user_db()?;
    conn.execute(
        "UPDATE users SET balance = ?1 WHERE tag_id = ?2",
        params![new_balance, tag_id],
    )?;
    Ok(())
}

pub fn update_user_by_tag_id(tag_id: &str, full_name: &str, is_admin: bool, balance: f64) -> Result<()> {
    let conn = open_user_db()?;
    conn.execute(
        "UPDATE users SET full_name = ?1, is_admin = ?2, balance = ?3 WHERE tag_id = ?4",
        params![full_name, is_admin, balance, tag_id],
    )?;
    Ok(())
}

pub fn delete_user_by_tag_id(tag_id: &str) -> Result<()> {
    let conn = open_user_db()?;
    conn.execute("DELETE FROM users WHERE tag_id = ?1", params![tag_id])?;
    Ok(())
}