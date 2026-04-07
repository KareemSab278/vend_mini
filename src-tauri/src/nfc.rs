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

use linux_embedded_hal as hal;

use std::collections::HashMap;
use std::convert::TryInto;
use std::thread;
use std::time::Duration;

use embedded_hal::delay::DelayNs;
use hal::spidev::{SpiModeFlags, SpidevOptions};
use hal::Delay;
use hal::SpidevDevice;
use mfrc522::comm::{blocking::spi::SpiInterface, Interface};
use mfrc522::{Initialized, Mfrc522};
use tauri::Emitter;

const SCAN_DELAY_MS: u32 = 500;
const DEBOUNCE_MS: u64 = 1500;


fn get_spi() -> Result<SpidevDevice, ()> {
    SpidevDevice::open("/dev/spidev0.0").map_err(|e| {
        eprintln!("Failed to open SPI device: {:?}", e);
    })
}

// - `"nfc-admin-found"` — tag UID is in the admin allow-list
// - `"nfc-unknown-tag"` — tag UID is not recognised

pub fn start_nfc_listener(app_handle: tauri::AppHandle) {

    let admin_tags: HashMap<[u8; 4], &str> = HashMap::from([ // immutable
            ([132, 35, 165, 229], "ACCEPTED CARD - SERVICE ENGINEER"),
            ([105, 126, 202, 6], "ACCEPTED CARD - ADMIN (clean card)"),
            ([222, 183, 17, 6], "ACCEPTED TAG - ADMIN (clean tag)"),
        ]);

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
                    let uid_bytes: [u8; 4] = match uid.as_bytes().try_into() {
                        Ok(b) => b,
                        Err(_) => {
                            eprintln!("Unexpected UID length — skipping");
                            delay.delay_ms(SCAN_DELAY_MS);
                            continue;
                        }
                    };

                    println!("Scanned UID: {:?}", uid_bytes);

                    if let Some(label) = admin_tags.get(&uid_bytes) {
                        println!("Admin tag recognised: {label}");
                        if let Err(e) = app_handle.emit("nfc-admin-found", label.to_string()) {
                            eprintln!("Failed to emit nfc-admin-found: {e}");
                        }
                    } else {
                        println!("Unknown tag — not in allow-list");
                        if let Err(e) = app_handle.emit("nfc-unknown-tag", true) {
                            eprintln!("Failed to emit nfc-unknown-tag: {e}");
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
