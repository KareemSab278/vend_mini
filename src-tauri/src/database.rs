use rusqlite::{params, Connection, Result};
use serde::{Serialize};
use std::path::PathBuf;
use std::fs;

const ORDERS_DATABASE_FILE: &str = "ordering_system_data.db";
const PRODUCTS_FILE: &str = "products.db";

fn orders_db_path(file: &str) -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let dir = PathBuf::from(home).join("data");
    let _ = fs::create_dir_all(&dir);
    dir.join(file)
}

const CREATE_PRODUCTS_SQL: &str =
"CREATE TABLE IF NOT EXISTS products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    product_category TEXT NOT NULL,
    product_price REAL NOT NULL,
    product_availability INTEGER NOT NULL DEFAULT 1
)";

pub fn initialize_products_database() -> Result<()> {
    let conn = Connection::open(orders_db_path(PRODUCTS_FILE))?;
    conn.execute(CREATE_PRODUCTS_SQL, [])?;
    println!("Products database and table created successfully.");
    Ok(())
}

const CREATE_ORDERS_SQL: &str =
"CREATE TABLE IF NOT EXISTS orders (
    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price FLOAT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)";

pub fn initialize_orders_database() -> Result<()> {
    let conn = Connection::open(orders_db_path(ORDERS_DATABASE_FILE))?;
    conn.execute(
        CREATE_ORDERS_SQL,
        [],
    )?;
    println!("Database and table created successfully.");
    Ok(())
}

fn check_database_exists(database: &str) -> bool {
    std::path::Path::new(&database).exists()
}


pub fn insert_order(product_id: i32, quantity: i32, price: f64) -> Result<()> {
    let db_path = orders_db_path(ORDERS_DATABASE_FILE);
    if !check_database_exists(db_path.to_str().unwrap_or("")) {
        initialize_orders_database()?;
    }

    let conn = Connection::open(orders_db_path(ORDERS_DATABASE_FILE))?;
    conn.execute(
        "INSERT INTO orders (product_id, quantity, price) VALUES (?1, ?2, ?3)",
        params![product_id, quantity, price],
    )?;
    println!("Order inserted successfully.");
    Ok(())
}

pub fn new_product(product_name: &str, product_category: &str, product_price: f64, product_availability: bool) -> Result<()> {
    let db_path = orders_db_path(PRODUCTS_FILE);
    if !check_database_exists(db_path.to_str().unwrap_or("")) {
        initialize_products_database()?;
    }
    let conn = Connection::open(orders_db_path(PRODUCTS_FILE))?;
    conn.execute(
        "INSERT INTO products (product_name, product_category, product_price, product_availability) VALUES (?1, ?2, ?3, ?4)",
        params![product_name, product_category, product_price, product_availability],
    )?;
    println!("Product inserted successfully.");
    Ok(())
}

pub fn delete_product(product_id: i32) -> Result<()> {
    let db_path = orders_db_path(PRODUCTS_FILE);
    if !check_database_exists(db_path.to_str().unwrap_or("")) {
        return Ok(()); // nothing to delete
    }
    let conn = Connection::open(orders_db_path(PRODUCTS_FILE))?;
    conn.execute(
        "DELETE FROM products WHERE product_id = ?1",
        params![product_id],
    )?;
    println!("Product deleted successfully.");
    Ok(())
}

#[derive(Serialize, Debug)]
pub struct Product {
    pub product_id: i32,
    pub product_name: String,
    pub product_category: String,
    pub product_price: f64,
    pub product_availability: bool,
}

pub fn query_products() -> Result<Vec<Product>> {
    if !check_database_exists(orders_db_path(PRODUCTS_FILE).to_str().unwrap_or("")) {
        return Ok(vec![]);
    }
    let conn = Connection::open(orders_db_path(PRODUCTS_FILE))?;
    let mut stmt = conn.prepare("SELECT product_id, product_name, product_category, product_price, product_availability FROM products")?;
    let product_iter = stmt.query_map([], |row| {
        Ok(Product {
            product_id: row.get(0)?,
            product_name: row.get(1)?,
            product_category: row.get(2)?,
            product_price: row.get(3)?,
            product_availability: row.get(4)?,
        })
    })?;
    let mut products = Vec::new();
    for product in product_iter {
        products.push(product?);
    }
    Ok(products)
}
