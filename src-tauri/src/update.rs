use tokio::fs::File;
use tokio::io::AsyncWriteExt;

const LATEST_RELEASE_URL: &str =
    "https://raw.githubusercontent.com/KareemSab278/vend_mini_releases/main/latest_release.json";

fn to_raw_github_url(url: &str) -> String {
    if let Some(stripped) = url.strip_prefix("https://github.com/") {
        if let Some((repo_path, blob_path)) = stripped.split_once("/blob/") {
            return format!("https://raw.githubusercontent.com/{repo_path}/{blob_path}");
        }
    }

    url.to_string()
}

async fn get_download_url() -> Result<String, String> {
    let response = reqwest::get(LATEST_RELEASE_URL).await.map_err(|err| err.to_string())?;

    if response.status().is_success() {
        let json: serde_json::Value = response.json().await.map_err(|err| err.to_string())?;
        if let Some(download_url) = json.get("download_url") {
            if let Some(download_url_str) = download_url.as_str() {
                return Ok(to_raw_github_url(download_url_str));
            }
        }
    }

    Err("Failed to fetch download URL".to_string())
}

async fn is_update_available() -> Result<bool, String> {
    let response = reqwest::get(LATEST_RELEASE_URL).await.map_err(|err| err.to_string())?;

    if response.status().is_success() {
        let json: serde_json::Value = response.json().await.map_err(|err| err.to_string())?;
        if let Some(latest_version) = json.get("version") {
            if let Some(latest_version_str) = latest_version.as_str() {
                let current_version = env!("CARGO_PKG_VERSION");
                return Ok(latest_version_str != current_version);
                // as in 0.1.3 != 0.1.4 or 0.1.5 != 0.1.4 (forced downgrade)
            }
        }
    }

    Err("Failed to fetch latest version".to_string())
}

#[tauri::command]
pub async fn install_update() -> Result<(), String> {
    let download_url = get_download_url().await?;

    let update_available = is_update_available().await?;
    if !update_available {
        return Err("No update available".to_string());
    }

    let downloads_dir =
        dirs::download_dir().ok_or_else(|| "No Downloads folder found".to_string())?;

    let file_name = download_url
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Invalid file name".to_string())?;

    let file_path = downloads_dir.join(file_name);

    println!("Downloading to: {:?}", file_path);

    let mut response = reqwest::get(&download_url).await.map_err(|err| err.to_string())?;
    response
        .error_for_status_ref()
        .map_err(|err| err.to_string())?;

    let mut file = File::create(&file_path).await.map_err(|err| err.to_string())?;
    while let Some(chunk) = response.chunk().await.map_err(|err| err.to_string())? {
        file.write_all(&chunk).await.map_err(|err| err.to_string())?;
    }

    println!("Download complete");

    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&file_path)
            .map_err(|err| err.to_string())?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&file_path, perms).map_err(|err| err.to_string())?;

        if file_path.extension().and_then(|e| e.to_str()) == Some("deb") {
            let _ = std::process::Command::new("/usr/bin/pkexec")
                .arg("/usr/bin/dpkg")
                .arg("-i")
                .arg(&file_path)
                .status()
                .map_err(|e| e.to_string())?;

            return Ok(()); // Exit after installing the .deb package from frontend
        } else {
            std::process::Command::new(&file_path)
                .spawn()
                .map_err(|err| err.to_string())?;
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        std::process::Command::new(&file_path)
            .spawn()
            .map_err(|err| err.to_string())?;
    }

    Ok(())
}
