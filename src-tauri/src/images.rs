/*
    this file handles images uploaded from the admin html page.
    it gets the images and saves it to fs in /data/images.
    then it also serves the images like in an api to the tauri frontend so that it can display them.
*/
use image::GenericImageView;
use std::fs;
use std::path::PathBuf;

fn images_path() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned());
    let directory_path = PathBuf::from(home).join("data").join("images");
    let _ = fs::create_dir_all(&directory_path);
    directory_path
}

pub async fn handle_image_upload<T: GenericImageView>(image: &T) -> Result<(), std::io::Error> {
    let bytes: Vec<u8> = vec![/* your raw image data here */];
    let output_path = images_path().join("output_image.png");
    // Save the raw bytes directly to disk
    fs::write(output_path, bytes)?;
    println!("Image saved successfully at {:?}", output_path);
    Ok(())
}

#[tauri::command]
pub async fn get_images() -> Result<Vec<GenericImageView>, std::io::Error> { // like an api call to get images in a normal server
    let mut images = Vec::new();
    let images_dir = images_path();
    if let Ok(entries) = fs::read_dir(images_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                if let Ok(img) = image::open(entry.path()) {
                    images.push(img);
                }
            }
        }
    }
    Ok(images)
}

// only accessible in the admin html page
pub async fn delete_image(image_name: &str) -> Result<(), std::io::Error> {
    // function to delete an image from the fs in /data/images
    let image_path = images_path().join(image_name);
    if image_path.exists() {
        fs::remove_file(image_path)?;
    }
    Ok(())
}
