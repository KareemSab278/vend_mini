use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use std::net::{SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use tower_http::services::ServeDir;

static SERVER_STARTED: AtomicBool = AtomicBool::new(false);

use crate::database;
use crate::users_database;
use crate::users_database::NewUser;

// ───────────────────────────────────────────────────────────────────────────── users

async fn new_user(Json(user): Json<NewUser>) -> impl IntoResponse {
    match users_database::new_user(user) {
        Ok(_) => (StatusCode::CREATED, "ok".to_string()),
        Err(e) => {
            eprintln!("POST /users error: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("error: {}", e))
        }
    }
}

async fn update_user_by_tag_id(
    Query(params): Query<TagQuery>,
    Json(payload): Json<NewUser>,
) -> impl IntoResponse {
    if let Some(tag_id) = params.tag_id {
        println!(
            "PUT /users?tag_id={} payload: full_name='{}' is_admin={} balance={}",
            tag_id, payload.full_name, payload.is_admin, payload.balance
        );
        match users_database::update_user_by_tag_id(
            &tag_id,
            &payload.full_name,
            payload.is_admin,
            payload.balance,
        ) {
            Ok(_) => (StatusCode::OK, "User updated".to_string()).into_response(),
            Err(e) => {
                eprintln!("PUT /users?tag_id={} error: {}", tag_id, e);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("error: {}", e)).into_response()
            }
        }
    } else {
        println!("PUT /users with no tag_id");
        (
            StatusCode::BAD_REQUEST,
            "Missing tag_id query parameter".to_string(),
        )
            .into_response()
    }
}

#[derive(Deserialize)]
struct TagQuery {
    tag_id: Option<String>,
}

async fn get_user_by_tag_id(Query(params): Query<TagQuery>) -> impl IntoResponse {
    // this fn will probably bite me later because of into_response.
    if let Some(tag_id) = params.tag_id {
        println!("GET /users?tag_id={}", tag_id);
        match users_database::get_user_by_tag_id(&tag_id) {
            Ok(Some(user)) => (StatusCode::OK, Json(user)).into_response(),
            Ok(None) => (StatusCode::NOT_FOUND, "User not found".to_string()).into_response(),
            Err(e) => {
                eprintln!("GET /users?tag_id={} error: {}", tag_id, e);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("error: {}", e)).into_response()
            }
        }
    } else {
        println!("GET /users with no tag_id");
        (
            StatusCode::BAD_REQUEST,
            "Missing tag_id query parameter".to_string(),
        )
            .into_response()
    }
}

// this really is more of a lib.rs tauri fn but added here just in case
async fn get_balance_by_tag_id(Query(params): Query<TagQuery>) -> impl IntoResponse {
    if let Some(tag_id) = params.tag_id {
        println!("GET /balance?tag_id={}", tag_id);
        match users_database::fetch_balance_by_tag_id(&tag_id) {
            Ok(Some(balance)) => (StatusCode::OK, Json(balance)).into_response(),
            Ok(None) => (StatusCode::NOT_FOUND, Json(0.00)).into_response(),
            Err(e) => {
                eprintln!("GET /balance?tag_id={} error: {}", tag_id, e);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("error: {}", e)).into_response()
            }
        }
    } else {
        println!("GET /balance with no tag_id");
        (
            StatusCode::BAD_REQUEST,
            "Missing tag_id query parameter".to_string(),
        )
            .into_response()
    }
}

async fn update_balance_by_tag_id(
    Query(params): Query<TagQuery>,
    Json(payload): Json<f64>,
) -> impl IntoResponse {
    if let Some(tag_id) = params.tag_id {
        println!(
            "PUT /balance?tag_id={} payload: balance={}",
            tag_id, payload
        );
        match users_database::deduct_balance_by_tag_id(&tag_id, payload) {
            Ok(_) => (StatusCode::OK, "Balance updated".to_string()).into_response(),
            Err(e) => {
                eprintln!("PUT /balance?tag_id={} error: {}", tag_id, e);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("error: {}", e)).into_response()
            }
        }
    } else {
        println!("PUT /balance with no tag_id");
        (
            StatusCode::BAD_REQUEST,
            "Missing tag_id query parameter".to_string(),
        )
            .into_response()
    }
}

async fn delete_user_by_tag_id(Query(params): Query<TagQuery>) -> impl IntoResponse {
    if let Some(tag_id) = params.tag_id {
        println!("DELETE /users?tag_id={}", tag_id);
        match users_database::delete_user_by_tag_id(&tag_id) {
            Ok(_) => (StatusCode::OK, "User deleted".to_string()).into_response(),
            Err(e) => {
                eprintln!("DELETE /users?tag_id={} error: {}", tag_id, e);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("error: {}", e)).into_response()
            }
        }
    } else {
        println!("DELETE /users with no tag_id");
        (
            StatusCode::BAD_REQUEST,
            "Missing tag_id query parameter".to_string(),
        )
            .into_response()
    }
}

async fn search_users_by_name(Path(name): Path<String>) -> impl IntoResponse {
    println!("GET /users/name/{}", name);
    match users_database::search_users_by_name(&name) {
        Ok(users) => (StatusCode::OK, Json(users)).into_response(),
        Err(e) => {
            eprintln!("GET /users/name/{} error: {}", name, e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("error: {}", e)).into_response()
        }
    }
}

// ───────────────────────────────────────────────────────────────────────────── products
#[derive(Deserialize)]
struct NewProduct {
    product_name: String,
    product_category: String,
    product_price: f64,
    product_availability: bool,
}

async fn get_products() -> Json<Vec<database::Product>> {
    let products = database::fetch_products().unwrap_or_default();
    Json(products)
}

#[derive(Deserialize)]
struct NewCategory {
    category_name: String,
}

async fn get_categories() -> Json<Vec<String>> {
    let categories = database::get_categories().unwrap_or_default();
    Json(categories)
}

async fn create_category(Json(payload): Json<NewCategory>) -> impl IntoResponse {
    println!("POST /categories payload: name='{}'", payload.category_name);
    match database::create_category(&payload.category_name) {
        Ok(_) => (StatusCode::CREATED, "ok".to_string()),
        Err(e) => {
            eprintln!("POST /categories error: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("error: {}", e))
        }
    }
}

async fn create_product(Json(payload): Json<NewProduct>) -> impl IntoResponse {
    println!(
        "POST /products payload: name='{}' category='{}' price={} avail={}",
        payload.product_name,
        payload.product_category,
        payload.product_price,
        payload.product_availability
    );
    match database::add_product(
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
    match database::remove_product(id) {
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
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if !ip.is_empty() && ip != "0.0.0.0" {
                    return ip;
                }
            }
        }
    }

    // Fall back when offline or on a local-only network so the process never
    // panics. Browsers on the same machine can still reach 127.0.0.1.
    "127.0.0.1".to_string()
}

#[tauri::command]
pub fn return_editor_url() -> String {
    let local_ip = get_local_ip();
    format!("http://{}:8000", local_ip)
}

#[tauri::command]
pub async fn initialize_static_page_server() -> Result<(), String> {
    if SERVER_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        tokio::spawn(start());
    }
    Ok(())
}

pub async fn start() {
    let app = Router::new()
        .route("/categories", get(get_categories).post(create_category))
        .route("/products", get(get_products).post(create_product))
        .route("/products/:id", delete(remove_product).put(edit_product))
        .route("/orders", get(view_orders))
        .route("/orders/detail", get(view_orders_detail))
        .route(
            "/users",
            post(new_user)
                .put(update_user_by_tag_id)
                .delete(delete_user_by_tag_id),
        )
        .route("/users", get(get_user_by_tag_id))
        .route("/users/name/:name", get(search_users_by_name))
        .route(
            "/balance",
            get(get_balance_by_tag_id).put(update_balance_by_tag_id),
        )
        .fallback_service(ServeDir::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/static"
        )));
    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    let local_ip = get_local_ip();

    println!("Server running on http://{}:8000", local_ip);

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Server already running or port in use: {}", e);
            return;
        }
    };
    println!("Server listener bound on {}", addr);
    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("Static page server error: {}", e);
    }
}
