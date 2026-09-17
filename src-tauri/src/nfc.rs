//! NFC tag listener using MFRC522 over SPI.
//!
//! # Connections
//!
//! - 3V3    = VCC
//! - GND    = GND
//! - GPIO9  = MISO
//! - GPIO10 = MOSI
//! - GPIO11 = SCLK (SCK)
//! - GPIO8  = NSS  (SDA)
//!
// CREDIT: based on code found in this repo -> https://gitlab.com/jspngh/mfrc522/-/tree/main/examples/rpi4

#[cfg(target_os = "linux")]
use linux_embedded_hal as hal;

#[cfg(target_os = "linux")]
use embedded_hal::delay::DelayNs;
#[cfg(target_os = "linux")]
use hal::spidev::{SpiModeFlags, SpidevOptions};
#[cfg(target_os = "linux")]
use hal::Delay;
#[cfg(target_os = "linux")]
use hal::SpidevDevice;
#[cfg(target_os = "linux")]
use mfrc522::comm::{blocking::spi::SpiInterface, Interface};
#[cfg(target_os = "linux")]
use mfrc522::{Initialized, Mfrc522};

#[cfg(target_os = "linux")]
use std::thread;
#[cfg(target_os = "linux")]
use std::time::Duration;

#[cfg(target_os = "linux")]
use tauri::Emitter;

#[cfg(target_os = "linux")]
use crate::users_database;

#[cfg(target_os = "linux")]
const SCAN_DELAY_MS: u32 = 500;
#[cfg(target_os = "linux")]
const DEBOUNCE_MS: u64 = 1500;

#[cfg(target_os = "linux")]
fn get_spi() -> Result<SpidevDevice, ()> {
    SpidevDevice::open("/dev/spidev0.0").map_err(|e| {
        eprintln!("Failed to open SPI device: {:?}", e);
    })
}

// - `"nfc-admin-found"` — tag UID is in the admin allow-list
// - `"nfc-unknown-tag"` — tag UID is not recognised

#[cfg(target_os = "linux")]
pub fn start_nfc_listener(app_handle: tauri::AppHandle) {
    if std::env::consts::OS != "linux" {
        println!(
            "\nLINUX OS REQUIRED.\nDETECTED: {}.\nNFC listener not started.\n",
            std::env::consts::OS
        );
        return;
    }

    thread::spawn(move || {
        let options = SpidevOptions::new()
            .max_speed_hz(1_000_000)
            .mode(SpiModeFlags::SPI_MODE_0)
            .build();

        // retry opening the SPI device until it succeeds.
        let mut spi = loop {
            match get_spi() {
                Ok(s) => break s,
                Err(_) => {
                    println!("Retrying SPI device in 3 seconds…");
                    thread::sleep(Duration::from_secs(3));
                }
            }
        };

        if let Err(e) = spi.configure(&options) {
            eprintln!("Failed to configure SPI device: {:?}", e);
            return;
        }

        let itf = SpiInterface::new(spi);
        let mut mfrc522 = match Mfrc522::new(itf).init() {
            Ok(m) => m,
            Err(e) => {
                eprintln!("Failed to initialise MFRC522: {:?}", e);
                return;
            }
        };

        let vers = match mfrc522.version() {
            Ok(v) => v,
            Err(e) => {
                eprintln!("Failed to read MFRC522 version: {:?}", e);
                return;
            }
        };

        match vers {
            0x91 | 0x92 => println!("MFRC522 Version 1 (0x{vers:x}) — NFC listener starting…"),
            0x90 => println!("MFRC522 Version 2 (0x{vers:x}) — NFC listener starting…"),
            0x82 => println!("Older MFRC522 (0x{vers:x}) — NFC listener starting…"),
            _ => {
                eprintln!("Unknown MFRC522 version 0x{vers:x} — NFC listener not started.");
                return;
            }
        }

        let mut delay = Delay;
        println!("NFC listener active — scanning…");

        loop {
            if let Ok(atqa) = mfrc522.reqa() {
                if let Ok(uid) = mfrc522.select(&atqa) {
                    let uid_bytes = uid.as_bytes();
                    let uid_hex = uid_bytes
                        .iter()
                        .map(|hex| format!("{:02x}", hex)) // we only work with lowercase hex. not the id array. the db auto holds it as lowercase anyway.
                        .collect::<String>();

                    println!("SCANNED UID: {}", &uid_hex);

                    match users_database::get_user_by_tag_id(&uid_hex) {
                        Ok(Some(user)) if user.is_admin => {
                            println!("nfc-admin-found");
                            if let Err(e) =
                                app_handle.emit("nfc-admin-found", user.user_id.to_string())
                            {
                                eprintln!("Failed to emit nfc-admin-found: {e}");
                            }
                        }
                        Ok(Some(_)) => {
                            println!("nfc-unknown-tag");
                            if let Err(e) = app_handle.emit("nfc-unknown-tag", uid_hex.clone()) {
                                eprintln!("Failed to emit nfc-unknown-tag: {e}");
                            }
                        }
                        Ok(None) | Err(_) => {
                            println!("nfc-unknown-tag");
                            if let Err(e) = app_handle.emit("nfc-unknown-tag", uid_hex.clone()) {
                                eprintln!("Failed to emit nfc-unknown-tag: {e}");
                            }
                        }
                    }

                    thread::sleep(Duration::from_millis(DEBOUNCE_MS));
                    continue;
                }
            }
            delay.delay_ms(SCAN_DELAY_MS);
        }
    });
}


#[cfg(not(target_os = "linux"))]
pub fn start_nfc_listener(_app_handle: tauri::AppHandle) {
    println!("\nLINUX OS REQUIRED.\nDETECTED: {}.\nNFC listener not started.\n", std::env::consts::OS);
}

#[cfg(target_os = "linux")]
pub fn listen_for_tag_ids() -> Result<String, String> {
    if std::env::consts::OS != "linux" {
        println!(
            "\nLINUX OS REQUIRED.\nDETECTED: {}.\nNFC listener not started.\n",
            std::env::consts::OS
        );
        return Err("NFC listener not started due to unsupported OS".to_string());
    }

    let options = SpidevOptions::new()
        .max_speed_hz(1_000_000)
        .mode(SpiModeFlags::SPI_MODE_0)
        .build();

    let mut spi = loop {
        match get_spi() {
            Ok(s) => break s,
            Err(_) => {
                println!("Retrying SPI device in 3 seconds…");
                thread::sleep(Duration::from_secs(3));
            }
        }
    };

    if let Err(e) = spi.configure(&options) {
        eprintln!("Failed to configure SPI device: {:?}", e);
        return Err("Failed to configure SPI device".to_string());
    }

    let itf = SpiInterface::new(spi);
    let mut mfrc522 = match Mfrc522::new(itf).init() {
        Ok(m) => m,
        Err(e) => {
            eprintln!("Failed to initialise MFRC522: {:?}", e);
            return Err("Failed to initialise MFRC522".to_string());
        }
    };

    let vers = match mfrc522.version() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Failed to read MFRC522 version: {:?}", e);
            return Err("Failed to read MFRC522 version".to_string());
        }
    };

    match vers {
        0x91 | 0x92 => println!("MFRC522 Version 1 (0x{vers:x}) — NFC listener starting…"),
        0x90 => println!("MFRC522 Version 2 (0x{vers:x}) — NFC listener starting…"),
        0x82 => println!("Older MFRC522 (0x{vers:x}) — NFC listener starting…"),
        _ => {
            eprintln!("Unknown MFRC522 version 0x{vers:x} — NFC listener not started.");
            return Err("Unknown MFRC522 version".to_string());
        }
    }

    let mut delay = Delay;

    loop {
        if let Ok(atqa) = mfrc522.reqa() {
            if let Ok(uid) = mfrc522.select(&atqa) {
                let uid_hex = uid
                    .as_bytes()
                    .iter()
                    .map(|hex| format!("{:02x}", hex))
                    .collect::<String>();

                println!("SCANNED UID: {}", &uid_hex);
                return Ok(uid_hex);
            }
        }
        delay.delay_ms(SCAN_DELAY_MS);
    }
}

#[cfg(not(target_os = "linux"))]
pub fn listen_for_tag_ids() -> Result<String, String> {
    Err("NFC listener not started due to unsupported OS".to_string())
}

#[tauri::command]
pub async fn get_tag_id() -> Result<String, String> {
    listen_for_tag_ids().map_err(|e| format!("Failed to get tag ID: {}", e))
}

#[cfg(target_os = "linux")]
#[allow(dead_code)]
fn handle_authenticate<E, COMM: Interface<Error = E>, F>(
    mfrc522: &mut Mfrc522<COMM, Initialized>,
    uid: &mfrc522::Uid,
    action: F,
) -> Result<(), anyhow::Error>
where
    F: FnOnce(&mut Mfrc522<COMM, Initialized>) -> Result<(), anyhow::Error>,
    E: std::fmt::Debug + std::marker::Sync + std::marker::Send + 'static,
{
    let key = [0xFF; 6];
    if mfrc522.mf_authenticate(uid, 1, &key).is_ok() {
        action(mfrc522)?;
    } else {
        println!("Could not authenticate");
    }

    mfrc522.hlta()?;
    mfrc522.stop_crypto1()?;
    Ok(())
}
