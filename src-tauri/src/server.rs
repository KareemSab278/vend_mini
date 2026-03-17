use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::Deserialize;
use std::net::{SocketAddr, UdpSocket};
use tower_http::services::ServeDir;

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
    println!(
        "POST /products payload: name='{}' category='{}' price={} avail={}",
        payload.product_name,
        payload.product_category,
        payload.product_price,
        payload.product_availability
    );
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

async fn view_orders() -> Json<Vec<database::Order>> {
    let orders = database::view_orders().unwrap_or_default();
    Json(orders)
}

#[derive(Deserialize)]
struct OrdersQuery {
    start_date: Option<String>,
    end_date: Option<String>,
}

async fn view_orders_detail(
    Query(params): Query<OrdersQuery>,
) -> Json<Vec<database::OrderWithProduct>> {
    let orders = database::view_orders_with_products(
        params.start_date.as_deref(),
        params.end_date.as_deref(),
    )
    .unwrap_or_default();
    Json(orders)
}

async fn edit_product(Path(id): Path<i32>, Json(payload): Json<NewProduct>) -> impl IntoResponse {
    println!(
        "PUT /products/{} payload: name='{}' category='{}' price={} avail={}",
        id,
        payload.product_name,
        payload.product_category,
        payload.product_price,
        payload.product_availability
    );
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
        .route("/orders", get(view_orders))
        .route("/orders/detail", get(view_orders_detail))
        .fallback_service(ServeDir::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/static"
        )));
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    let local_ip = get_local_ip();

    println!("Server running on http://{}:3000", local_ip);

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Server already running or port in use: {}", e);
            return;
        }
    };

    axum::serve(listener, app).await.unwrap();
}
