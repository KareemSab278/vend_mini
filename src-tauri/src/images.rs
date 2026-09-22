/*
    this file handles images uploaded from the admin html page.
    it gets the images and saves them to fs in ~/data/images.
    then it also serves the images via HTTP to the admin page and the tauri frontend.
*/
use axum::{
    extract::{Multipart, Path},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

fn images_path() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned());
    let directory_path = PathBuf::from(home).join("data").join("images");
    fs::create_dir_all(&directory_path).map_err(|e| format!("Failed to create images directory: {}", e))?;
    Ok(directory_path)
}

fn is_safe_image_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains('/')
        && !name.contains('\\')
        && !name.starts_with('.')
        && {
            let lower = name.to_lowercase();
            lower.ends_with(".png")
                || lower.ends_with(".jpg")
                || lower.ends_with(".jpeg")
                || lower.ends_with(".webp")
                || lower.ends_with(".gif")
        }
}

#[derive(Serialize)]
pub struct ImageListEntry {
    name: String,
    url: String,
}

pub async fn list_images() -> Json<Vec<ImageListEntry>> {
    let mut entries = Vec::new();
    if let Ok(images_dir) = images_path() {
        if let Ok(dir) = fs::read_dir(images_dir) {
            for entry in dir.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        let name = entry.file_name().to_string_lossy().into_owned();
                        entries.push(ImageListEntry {
                            url: format!("/images/{}", name),
                            name,
                        });
                    }
                }
            }
        }
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Json(entries)
}

#[tauri::command]
pub async fn list_images_command() -> Result<Vec<ImageListEntry>, String> {
    let mut entries = Vec::new();
    let images_dir = images_path()?;
    if let Ok(dir) = fs::read_dir(images_dir) {
        for entry in dir.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    entries.push(ImageListEntry {
                        url: format!("/images/{}", name),
                        name,
                    });
                }
            }
        }
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}


pub async fn serve_image(Path(name): Path<String>) -> impl IntoResponse {
    if !is_safe_image_name(&name) {
        return (StatusCode::BAD_REQUEST, "Invalid image name").into_response();
    }
    let path = match images_path() {
        Ok(p) => p.join(&name),
        Err(e) => {
            eprintln!("GET /images/{} error: {}", name, e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get image path").into_response();
        }
    };
    if !path.exists() {
        return (StatusCode::NOT_FOUND, "Image not found").into_response();
    }

    let bytes = match fs::read(&path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("GET /images/{} error: {}", name, e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read image").into_response();
        }
    };

    let content_type = match path.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        _ => "application/octet-stream",
    };

    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, content_type)],
        bytes,
    )
        .into_response()
}


pub async fn upload_image(mut multipart: Multipart) -> impl IntoResponse {
    let images_dir = match images_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Upload error: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get images directory").into_response();
        }
    };

    while let Ok(Some(field)) = multipart.next_field().await {
        let file_name = field.file_name().unwrap_or("upload").to_string();
        let data = match field.bytes().await {
            Ok(d) => d,
            Err(e) => {
                eprintln!("Upload read error: {}", e);
                return (StatusCode::BAD_REQUEST, "Failed to read upload").into_response();
            }
        };

        let clean = file_name
            .replace('/', "_")
            .replace('\\', "_")
            .replace("..", "_");
        if clean.is_empty() {
            continue;
        }

        let output_path = images_dir.join(&clean);
        if let Err(e) = fs::write(&output_path, &data) {
            eprintln!("Upload write error for {}: {}", clean, e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to save {}", clean),
            )
                .into_response();
        }
        println!("Image saved successfully at {:?}", output_path);
    }

    (StatusCode::CREATED, "ok").into_response()
}

pub async fn delete_image(Path(name): Path<String>) -> impl IntoResponse {
    if !is_safe_image_name(&name) {
        return (StatusCode::BAD_REQUEST, "Invalid image name").into_response();
    }
    let image_path = match images_path() {
        Ok(p) => p.join(&name),
        Err(e) => {
            eprintln!("DELETE /images/{} error: {}", name, e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get image path").into_response();
        }
    };
    if !image_path.exists() {
        return (StatusCode::NOT_FOUND, "Image not found").into_response();
    }
    match fs::remove_file(&image_path) {
        Ok(_) => (StatusCode::OK, "deleted").into_response(),
        Err(e) => {
            eprintln!("DELETE /images/{} error: {}", name, e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete image").into_response()
        }
    }
}
