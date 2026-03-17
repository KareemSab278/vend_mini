use rppal::gpio::Gpio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

const PIR_PIN: u8 = 26;

pub fn start(running: Arc<AtomicBool>) -> Result<bool, bool> {
    let gpio = match Gpio::new() {
        Ok(g) => g,
        Err(e) => {
            eprintln!("Failed to initialize GPIO: {}", e);
            return Err(false);
        }
    };

    let pin = match gpio.get(PIR_PIN) {
        Ok(p) => p.into_input(),
        Err(e) => {
            eprintln!("Failed to get GPIO pin {}: {}", PIR_PIN, e);
            return Err(false);
        }
    };

    println!("Sensor initialised . . .");
    thread::sleep(Duration::from_secs(2));
    println!("Active");

    let mut motion_detected = false;

    while running.load(Ordering::SeqCst) {
        let output_value = pin.is_high();

        if output_value {
            println!("Object detected!");
            motion_detected = true;
            thread::sleep(Duration::from_millis(300));
        }

        if motion_detected {
            thread::sleep(Duration::from_millis(800));
            motion_detected = false;
        }
    }
    
    Ok(true)
}


// mod motion_sensor;

// use std::sync::atomic::{AtomicBool, Ordering};
// use std::sync::Arc;

// fn main() {
//     let running = Arc::new(AtomicBool::new(true));
//     let r = running.clone();

//     if let Err(_) = motion_sensor::start(running) {
//         eprintln!("PIR sensor failed.");
//     }
// }