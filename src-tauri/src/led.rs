/*
    because the rs_ws281x library does not work on the Raspberry Pi 5, we need to use an esp32 instead.
    communictate with it over serial. send color commands like "red", "green", "blue", "white", "yellow", "none" to the esp32 over serial

    fire and forget color commands to the esp32.
*/

use crate::serial_comms;
use serde::Deserialize;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Color {
    Red,
    Green,
    Blue,
    White,
    Yellow,
    None,
}

impl Color {
    fn as_str(&self) -> &str {
        match self {
            Color::Red => "red",
            Color::Green => "green",
            Color::Blue => "blue",
            Color::White => "white",
            Color::Yellow => "yellow",
            Color::None => "none",
        }
    }
}

// need to make them share the same led port once found
use serial_comms::DeviceConnection;
use std::sync::Arc;
use std::sync::OnceLock;
// should have a global mutex available to share the LED connection across tasks
static LED_CONNECTION: OnceLock<Arc<DeviceConnection>> = OnceLock::new();

#[tauri::command]
pub async fn find_led_port() -> Result<(), String> {
    let led =
        serial_comms::led_connection()
            .map_err(|_| "Failed to get LED connection".to_string())?;

    LED_CONNECTION
        .set(led)
        .map_err(|_| "LED already initialized".to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn set_color(color: Color) -> Result<(), String> {
    let command = color.as_str();

    let led = LED_CONNECTION
        .get()
        .ok_or_else(|| "LED connection not found".to_string())?;

    led.send(command)
        .map_err(|e| format!("LED send failed: {:?}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn set_color_w_timeout(color: Color, timeout_secs: Option<u8>) -> Result<(), String> {
    set_color(color).await?;

    tokio::time::sleep(std::time::Duration::from_secs(
        timeout_secs.unwrap_or(6) as u64
    ))
    .await;

    set_color(Color::White).await?;

    Ok(())
}

/*
// LED RUST CODE LIB RS_WS281X DOES NOT WORK ON THE RASPBERRY PI 5 - NEEDS WORK. USE esp32 INSTEAD WITH CODE:

    #include <FastLED.h>

    #define NUM_LEDS 148
    #define DIN_PIN 23
    #define BRIGHTNESS 30

    CRGB leds[NUM_LEDS];

    CRGB currentColour = CRGB::Black;

    void fadeToColour(CRGB targetColour) {

    CRGB startColour = currentColour;

    const int steps = 100;
    const int fadeTime = 1000;
    const int delayTime = fadeTime / steps;

    for (int i = 1; i <= steps; i++) {

        uint8_t amount = map(i, 0, steps, 0, 255);

        CRGB blended = blend(
        startColour,
        targetColour,
        amount);

        fill_solid(
        leds,
        NUM_LEDS,
        blended);

        FastLED.show();

        delay(delayTime);
    }

    currentColour = targetColour;
    }

    String command = "";

    /*
    void setColour(CRGB colour) { // for switching color fast
        fill_solid(leds, NUM_LEDS, colour);
        FastLED.show();
    }
    */

    void setup() {

    Serial.begin(115200);

    FastLED.addLeds<WS2812B, DIN_PIN, GRB>(
        leds,
        NUM_LEDS);

    FastLED.setBrightness(BRIGHTNESS);

    FastLED.clear();
    FastLED.show();

    Serial.println("LED READY");
    Serial.println("Commands: red green blue white yellow none");
    }


    void loop() {

    while (Serial.available()) {

        char c = Serial.read();

        if (c == '\n' || c == '\r') {

        command.trim();
        command.toLowerCase();

        if (command == "red") {
            fadeToColour(CRGB::Red);
        }

        else if (command == "green") {
            fadeToColour(CRGB::Green);
        }

        else if (command == "blue") {
            fadeToColour(CRGB::Blue);
        }

        else if (command == "white") {
            fadeToColour(CRGB::White);
        }

        else if (command == "yellow") {
            fadeToColour(CRGB::Yellow);
        }

        else if (command == "none") {
            fadeToColour(CRGB::Black);
        }

        else if (command == "ident?") {
            Serial.println("LEDACK");
        }

        else {
            Serial.print("Unknown: ");
            Serial.println(command);
        }

        command = "";
        }

        else {
        command += c;
        }
    }
    }
*/
