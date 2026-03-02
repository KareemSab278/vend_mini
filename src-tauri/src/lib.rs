use serialport::{ DataBits, FlowControl, Parity, StopBits };
use std::io::{ BufRead, BufReader, Read, Write };
use std::net::TcpStream;
use std::time::Duration;

// ── Serial settings per MDB Master RS232 docs ──
// Baud: 115200, Data: 8, Parity: NONE, Stop: 1, HW flow: RTS/CTS, SW flow: NO
const BAUD_RATE: u32 = 115200;
const DAEMON_ADDR: &str = "127.0.0.1:5127";
const TCP_TIMEOUT_MS: u64 = 1000;


// test:
#[tauri::command]
fn greet(name: String) -> String{
    format!("{}, hello from rust!", name)
}

// ─────────────────────────────────────────────────────────────
//  HIGH LEVEL MODE — talks to the Python daemon via TCP :5127
//  Send text commands like CashlessReset(1), get JSON back.
// ─────────────────────────────────────────────────────────────
/// Send a text command to the MDB daemon on TCP 5127 and return the JSON response.


#[tauri::command]
fn mdb_command(command: String) -> Result<String, String> {
    println!("[TCP] Connecting to daemon at {}", DAEMON_ADDR);

    let stream = TcpStream::connect(DAEMON_ADDR).map_err(|e|
        format!(
            "Cannot connect to MDB daemon at {} — is the Python daemon running? Error: {}",
            DAEMON_ADDR,
            e
        )
    )?;

    stream
        .set_read_timeout(Some(Duration::from_millis(TCP_TIMEOUT_MS)))
        .map_err(|e| format!("Set timeout failed: {}", e))?;
    stream
        .set_write_timeout(Some(Duration::from_millis(TCP_TIMEOUT_MS)))
        .map_err(|e| format!("Set timeout failed: {}", e))?;

    let mut writer = stream.try_clone().map_err(|e| format!("Clone failed: {}", e))?;

    let msg = format!("{}\n", command.trim());
    println!("[TCP TX] {}", msg.trim());
    writer.write_all(msg.as_bytes()).map_err(|e| format!("Write failed: {}", e))?;
    writer.flush().map_err(|e| format!("Flush failed: {}", e))?;

    let mut reader = BufReader::new(&stream);
    let mut response = String::new();

    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => {
                break;
            } // EOF
            Ok(_) => {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    println!("[TCP RX] {}", trimmed);
                    if !response.is_empty() {
                        response.push('\n');
                    }
                    response.push_str(trimmed);
                }
            }
            Err(ref e) if
                e.kind() == std::io::ErrorKind::WouldBlock ||
                e.kind() == std::io::ErrorKind::TimedOut
            => {
                break; // done reading
            }
            Err(e) => {
                if response.is_empty() {
                    return Err(format!("Read failed: {}", e));
                }
                break;
            }
        }
    }

    if response.is_empty() {
        return Err("No response from MDB daemon (timeout)".into());
    }
    Ok(response)
}

// ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder
        ::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![mdb_command, greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


