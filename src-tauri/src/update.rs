use tokio::fs::File;
use tokio::io::AsyncWriteExt;

#[cfg(target_os = "linux")]
use tokio::process::Command as TokioCommand;

const LATEST_RELEASE_URL: &str =
    "https://raw.githubusercontent.com/KareemSab278/vend_mini_releases/main/latest_release.json";

/// Error prefix returned when PolicyKit cannot show a GUI/TUI prompt.
#[cfg(target_os = "linux")]
pub const NO_AUTH_AGENT_ERROR: &str = "NO_AUTH_AGENT:";

fn to_raw_github_url(url: &str) -> String {
    if let Some(stripped) = url.strip_prefix("https://github.com/") {
        if let Some((repo_path, blob_path)) = stripped.split_once("/blob/") {
            return format!("https://raw.githubusercontent.com/{repo_path}/{blob_path}");
        }
    }

    url.to_string()
}

async fn fetch_latest_release() -> Result<serde_json::Value, String> {
    let response = reqwest::get(LATEST_RELEASE_URL).await.map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    response.json().await.map_err(|err| err.to_string())
}

async fn get_download_url() -> Result<String, String> {
    let json = fetch_latest_release().await?;
    json.get("download_url")
        .and_then(|v| v.as_str())
        .map(|s| to_raw_github_url(s))
        .ok_or_else(|| "download_url missing in release manifest".to_string())
}

async fn is_update_available() -> Result<bool, String> {
    let json = fetch_latest_release().await?;
    if let Some(latest_version_str) = json.get("version").and_then(|v| v.as_str()) {
        let current_version = env!("CARGO_PKG_VERSION");
        return Ok(latest_version_str != current_version);
        // as in 0.1.3 != 0.1.4 or 0.1.5 != 0.1.4 (forced downgrade)
    }
    Err("Failed to fetch latest version".to_string())
}

async fn download_deb(download_url: &str) -> Result<std::path::PathBuf, String> {
    let downloads_dir =
        dirs::download_dir().ok_or_else(|| "No Downloads folder found".to_string())?;

    let file_name = download_url
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Invalid file name".to_string())?;

    let file_path = downloads_dir.join(file_name);

    println!("Downloading to: {:?}", file_path);

    let mut response = reqwest::get(download_url).await.map_err(|err| err.to_string())?;
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
    }

    Ok(file_path)
}

#[cfg(target_os = "linux")]
fn is_no_auth_agent_error(stderr: &str, exit_code: Option<i32>) -> bool {
    // pkexec returns 127 when it cannot find an authentication agent, and often
    // prints "Cannot run program ...: No such file or directory" or similar.
    stderr.to_lowercase().contains("no agent")
        || stderr.to_lowercase().contains("authentication agent")
        || exit_code == Some(127)
}

#[cfg(target_os = "linux")]
async fn install_deb_with_pkexec(file_path: &std::path::Path) -> Result<(), String> {
    let output = TokioCommand::new("/usr/bin/pkexec")
        .arg("/usr/bin/dpkg")
        .arg("-i")
        .arg(file_path)
        .output()
        .await
        .map_err(|err| err.to_string())?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    if is_no_auth_agent_error(&stderr, output.status.code()) {
        return Err(format!(
            "{} No PolicyKit authentication agent is available. Please enter the sudo password.",
            NO_AUTH_AGENT_ERROR
        ));
    }

    Err(format!(
        "dpkg failed ({}). stdout: {} stderr: {}",
        output.status,
        stdout,
        stderr
    ))
}

#[cfg(target_os = "linux")]
async fn install_deb_with_sudo(file_path: &std::path::Path, password: &str) -> Result<(), String> {
    // Pipe the password into sudo so it works without a TTY.
    let mut child = TokioCommand::new("/usr/bin/sudo")
        .arg("-S")
        .arg("/usr/bin/dpkg")
        .arg("-i")
        .arg(file_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|err| err.to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(format!("{}\n", password).as_bytes())
            .await
            .map_err(|err| err.to_string())?;
    }

    let output = child.wait_with_output().await.map_err(|err| err.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("sudo dpkg failed ({}): {}", output.status, stderr))
    }
}

#[tauri::command]
pub async fn install_update() -> Result<(), String> {
    let download_url = get_download_url().await?;

    let update_available = is_update_available().await?;
    if !update_available {
        return Err("No update available".to_string());
    }

    let file_path = download_deb(&download_url).await?;

    #[cfg(target_os = "linux")]
    {
        if file_path.extension().and_then(|e| e.to_str()) == Some("deb") {
            return install_deb_with_pkexec(&file_path).await;
        }

        std::process::Command::new(&file_path)
            .spawn()
            .map_err(|err| err.to_string())?;
    }

    #[cfg(not(target_os = "linux"))]
    {
        std::process::Command::new(&file_path)
            .spawn()
            .map_err(|err| err.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn install_update_with_password(password: String) -> Result<(), String> {
    if password.is_empty() {
        return Err("Password cannot be empty".to_string());
    }

    let download_url = get_download_url().await?;

    let update_available = is_update_available().await?;
    if !update_available {
        return Err("No update available".to_string());
    }

    let file_path = download_deb(&download_url).await?;

    #[cfg(target_os = "linux")]
    {
        if file_path.extension().and_then(|e| e.to_str()) == Some("deb") {
            return install_deb_with_sudo(&file_path, &password).await;
        }

        std::process::Command::new(&file_path)
            .spawn()
            .map_err(|err| err.to_string())?;
    }

    #[cfg(not(target_os = "linux"))]
    {
        std::process::Command::new(&file_path)
            .spawn()
            .map_err(|err| err.to_string())?;
    }

    Ok(())
}
