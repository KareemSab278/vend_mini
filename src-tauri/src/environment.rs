#[tauri::command]
pub fn get_cpu_uid() -> Result<String, String> {
    
    let is_pi = cfg!(all(
        target_os = "linux",
        any(target_arch = "arm", target_arch = "aarch64")
    ));

    if !is_pi {
        return Err("unknown".to_string());
    }

    let uid_cmd = "awk '/Serial/ {print $3}' /proc/cpuinfo";
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(uid_cmd)
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                let uid = String::from_utf8_lossy(&output.stdout).trim().to_string();
                Ok(uid)
            } else {
                eprintln!(
                    "Error executing command: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
                Err("unknown".to_string())
            }
        }
        Err(e) => {
            eprintln!("Failed to execute command: {}", e);
            Err("unknown".to_string())
        }
    }
}
