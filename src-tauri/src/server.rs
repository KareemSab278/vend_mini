use axum::{
    routing::{get, delete, put, post},
    Json, Router,
    extract::Path,
    response::IntoResponse,
    http::StatusCode,
};
use tower_http::services::ServeDir;
use serde::Deserialize;
use std::net::{SocketAddr, UdpSocket};

#[path = "database.rs"]
mod database;

#[derive(Deserialize)]
struct NewProduct {
    product_name: String,
    product_category: String,
    product_price: f64,
    product_availability: bool,
}

async fn get_products() -> Json<Vec<database::Product>> {
    let products = database::query_products().unwrap_or_default();
    Json(products)
}

async fn create_product(Json(payload): Json<NewProduct>) -> impl IntoResponse {
    println!("POST /products payload: name='{}' category='{}' price={} avail={}", payload.product_name, payload.product_category, payload.product_price, payload.product_availability);
    match database::new_product(
        &payload.product_name,
        &payload.product_category,
        payload.product_price,
        payload.product_availability,
    ) {
        Ok(_) => (StatusCode::CREATED, "ok".to_string()),
        Err(e) => {
            eprintln!("POST /products error: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("error: {}", e))
        }
    }
}

async fn remove_product(Path(id): Path<i32>) -> impl IntoResponse {
    println!("DELETE /products/{}", id);
    match database::delete_product(id) {
        Ok(_) => (StatusCode::OK, "deleted".to_string()),
        Err(e) => {
            eprintln!("DELETE /products/{} error: {}", id, e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("error: {}", e))
        }
    }
}

async fn edit_product(Path(id): Path<i32>, Json(payload): Json<NewProduct>) -> impl IntoResponse {
    println!("PUT /products/{} payload: name='{}' category='{}' price={} avail={}", id, payload.product_name, payload.product_category, payload.product_price, payload.product_availability);
    match database::update_product(
        id,
        &payload.product_name,
        &payload.product_category,
        payload.product_price,
        payload.product_availability,
    ) {
        Ok(_) => (StatusCode::OK, "updated".to_string()),
        Err(e) => {
            eprintln!("PUT /products/{} error: {}", id, e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("error: {}", e))
        }
    }
}

fn get_local_ip() -> String {
    let socket = UdpSocket::bind("0.0.0.0:0").unwrap();
    socket.connect("8.8.8.8:80").unwrap();
    socket.local_addr().unwrap().ip().to_string()
}

pub fn return_editor_url() -> String {
    let local_ip = get_local_ip();
    format!("http://{}:3000", local_ip)
}

pub async fn start() {
    let app = Router::new()
        .route("/products", get(get_products).post(create_product))
        .route("/products/:id", delete(remove_product).put(edit_product))
        .fallback_service(ServeDir::new(concat!(env!("CARGO_MANIFEST_DIR"), "/src/static")));
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    let local_ip = get_local_ip();

    println!("Server running on http://{}:3000", local_ip);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap();

    axum::serve(listener, app)
        .await
        .unwrap();
}