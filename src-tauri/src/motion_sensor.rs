use rppal::gpio::Gpio;
use std::thread;
use std::time::Duration;
use tauri::Emitter;

const PIR_PIN: u8 = 7; // GPIO pin number for the PIR sensor (BCM numbering)

pub fn is_motion_sensor_working() -> bool {
    Gpio::new().is_ok() && Gpio::new().unwrap().get(PIR_PIN).is_ok() // returns true if we can access the GPIO pin, false otherwise
}

pub fn start_motion_listener(app_handle: tauri::AppHandle) {

    if !is_motion_sensor_working() {
        eprintln!("Motion sensor not working or not accessible.");
        return ();
    }

    thread::spawn(move || {
        let gpio = match Gpio::new() {
            Ok(g) => g,
            Err(e) => {
                eprintln!("Failed to initialize GPIO: {}", e);
                return;
            }
        };

        let pin = match gpio.get(PIR_PIN) {
            Ok(p) => p.into_input(),
            Err(e) => {
                eprintln!("Failed to get GPIO pin {}: {}", PIR_PIN, e);
                return;
            }
        };

        println!("Motion sensor initialised, listening...");
        thread::sleep(Duration::from_secs(2));
        println!("Motion sensor active");

        let mut last_state = false;

        loop {
            let is_high = pin.is_high();

            if is_high && !last_state {
                println!("Motion detected!");
                if let Err(e) = app_handle.emit("motion-detected", true) {
                    eprintln!("Failed to emit motion event: {}", e);
                }
            }

            last_state = is_high;
            thread::sleep(Duration::from_millis(50));
        }
    });
}
