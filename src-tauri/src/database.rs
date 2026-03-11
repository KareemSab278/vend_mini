use rusqlite::{params, Connection, Result};
use serde::Serialize;
use std::path::PathBuf;
use std::fs;

const DATA_FILE: &str = "ordering_system_data.db";

fn db_path() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned());
    let dir = PathBuf::from(home).join("data");
    let _ = fs::create_dir_all(&dir);
    dir.join(DATA_FILE)
}

pub fn initialize_database() -> Result<()> {
    let conn = Connection::open(db_path())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS products (
            product_id           INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name         TEXT    NOT NULL,
            product_category     TEXT    NOT NULL,
            product_price        REAL    NOT NULL,
            product_availability INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS orders (
            order_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            quantity   INTEGER NOT NULL,
            price      REAL    NOT NULL,
            timestamp  DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE VIEW IF NOT EXISTS orders_details AS
            SELECT
                o.order_id,
                o.product_id,
                COALESCE(p.product_name,     'Unknown') AS product_name,
                COALESCE(p.product_category, 'Unknown') AS product_category,
                o.quantity,
                o.price,
                o.timestamp
            FROM orders o
            LEFT JOIN products p ON o.product_id = p.product_id;",
    )?;
    Ok(())
}

fn open() -> Result<Connection> {
    initialize_database()?;
    Connection::open(db_path())
}


#[derive(Serialize, Debug)]
pub struct Product {
    pub product_id:           i32,
    pub product_name:         String,
    pub product_category:     String,
    pub product_price:        f64,
    pub product_availability: bool,
}

pub fn new_product(
    product_name: &str,
    product_category: &str,
    product_price: f64,
    product_availability: bool,
) -> Result<()> {
    let conn = open()?;
    conn.execute(
        "INSERT INTO products (product_name, product_category, product_price, product_availability)
         VALUES (?1, ?2, ?3, ?4)",
        params![product_name, product_category, product_price, product_availability],
    )?;
    Ok(())
}

pub fn delete_product(product_id: i32) -> Result<()> {
    let conn = open()?;
    conn.execute("DELETE FROM products WHERE product_id = ?1", params![product_id])?;
    Ok(())
}

pub fn update_product(
    product_id: i32,
    product_name: &str,
    product_category: &str,
    product_price: f64,
    product_availability: bool,
) -> Result<()> {
    let conn = open()?;
    conn.execute(
        "UPDATE products
         SET product_name = ?1, product_category = ?2,
             product_price = ?3, product_availability = ?4
         WHERE product_id = ?5",
        params![product_name, product_category, product_price, product_availability, product_id],
    )?;
    Ok(())
}

pub fn query_products() -> Result<Vec<Product>> {
    let conn = open()?;
    let mut stmt = conn.prepare(
        "SELECT product_id, product_name, product_category, product_price, product_availability
         FROM products",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Product {
            product_id:           row.get(0)?,
            product_name:         row.get(1)?,
            product_category:     row.get(2)?,
            product_price:        row.get(3)?,
            product_availability: row.get(4)?,
        })
    })?;
    rows.collect()
}


#[derive(Serialize, Debug)]
pub struct Order {
    pub order_id:   i32,
    pub product_id: i32,
    pub quantity:   i32,
    pub price:      f64,
    pub timestamp:  String,
}

pub fn insert_order(product_id: i32, quantity: i32, price: f64) -> Result<()> {
    let conn = open()?;
    conn.execute(
        "INSERT INTO orders (product_id, quantity, price) VALUES (?1, ?2, ?3)",
        params![product_id, quantity, price],
    )?;
    Ok(())
}

pub fn view_orders() -> Result<Vec<Order>> {
    let conn = open()?;
    let mut stmt = conn.prepare(
        "SELECT order_id, product_id, quantity, price, timestamp FROM orders",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Order {
            order_id:   row.get(0)?,
            product_id: row.get(1)?,
            quantity:   row.get(2)?,
            price:      row.get(3)?,
            timestamp:  row.get(4)?,
        })
    })?;
    rows.collect()
}


#[derive(Serialize, Debug)]
pub struct OrderWithProduct {
    pub order_id:         i32,
    pub product_id:       i32,
    pub product_name:     String,
    pub product_category: String,
    pub quantity:         i32,
    pub price:            f64,
    pub timestamp:        String,
}

pub fn view_orders_with_products(
    start_date: Option<&str>,
    end_date:   Option<&str>,
) -> Result<Vec<OrderWithProduct>> {
    let conn = open()?;

    let mut conditions:   Vec<String> = Vec::new();
    let mut param_values: Vec<String> = Vec::new();

    if let Some(s) = start_date.filter(|s| !s.is_empty()) {
        param_values.push(format!("{} 00:00:00", s));
        conditions.push(format!("timestamp >= ?{}", param_values.len()));
    }
    if let Some(e) = end_date.filter(|e| !e.is_empty()) {
        param_values.push(format!("{} 23:59:59", e));
        conditions.push(format!("timestamp <= ?{}", param_values.len()));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };

    let sql = format!(
        "SELECT order_id, product_id, product_name, product_category, quantity, price, timestamp
         FROM orders_details{} ORDER BY timestamp DESC",
        where_clause
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(param_values.iter()), |row| {
        Ok(OrderWithProduct {
            order_id:         row.get(0)?,
            product_id:       row.get(1)?,
            product_name:     row.get(2)?,
            product_category: row.get(3)?,
            quantity:         row.get(4)?,
            price:            row.get(5)?,
            timestamp:        row.get(6)?,
        })
    })?;
    rows.collect()
}