/*
    module is meant to control WS2812B RGB LED Strips with the rasp pi 4b using embedded hal
    there is a good example of this here: https://github.com/rpi-ws281x/rpi-ws281x-rust/blob/master/examples/basic.rs
    using this module: https://crates.io/crates/rs_ws281x/0.5.1 (3 years old 🙏😭)
    max brightness is 255 min is 0. defaults to 255 is empty
*/

#[cfg(target_os = "linux")]
use rs_ws281x::ChannelBuilder;
#[cfg(target_os = "linux")]
use rs_ws281x::ControllerBuilder;
#[cfg(target_os = "linux")]
use rs_ws281x::StripType;
use serde::{Deserialize, Serialize};

const LED_COUNT: u8 = 148;
const GPIO_PIN: u8 = 18;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Color {
    Red,
    Green,
    Blue,
    White,
    Yellow,
}

impl Color {
    fn to_rgb(&self) -> [u8; 4] {
        match self {
            Color::Red    => [0, 0, 255, 0],
            Color::Green  => [0, 255, 0, 0],
            Color::Blue   => [255, 0, 0, 0],
            Color::White  => [255, 255, 255, 0],
            Color::Yellow => [0, 255, 255, 0],
        }
    }
}


#[cfg(target_os = "linux")]
#[tauri::command]
pub fn set_color(color: Color) -> Result<(), String> {
    let mut controller = ControllerBuilder::new()
        .freq(800_000)
        .dma(10)
        .channel(
            0, // Channel Index
            ChannelBuilder::new()
                .pin(GPIO_PIN as i32)
                .count(LED_COUNT as i32)
                .strip_type(StripType::Ws2812)
                .brightness(255)
                .build(),
        )
        .build()
        .map_err(|e| format!("Failed to build LED controller: {e}"))?;

    let leds = controller.leds_mut(0);
    for led in leds.iter_mut() {
        *led = color.to_rgb(); 
    }

    controller.render().map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn set_color_w_timeout(color: Color, timeout_secs: Option<u8>) -> Result<(), String> {
    set_color(color)?;
    let t_out = timeout_secs.unwrap_or(3);
    tokio::time::sleep(std::time::Duration::from_secs(t_out as u64)).await;
    set_color(Color::White)?;
    Ok(())
}
