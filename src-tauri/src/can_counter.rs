use crate::serial_comms;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub struct CanColCount {
    pub column: u8,    // no more than 20 columns anyway
    pub count: Option<u8>, // cant be more then 12 cans anyway so u8 is ok
    pub live_distance: Option<f32>, // distance measurement from the sensor in millimeters
}

enum CansCountCmds {
    StopListen,
    StartListen,
    ListenWithDuration(u8),
}

impl CansCountCmds {
    fn execute(&self) -> Result<Vec<CanColCount>, String> {
        let connection = serial_comms::can_counter_connection()?;
        match self {
            CansCountCmds::StopListen => {
                connection.send("stop")?;
                Ok(Vec::new())
            }
            CansCountCmds::StartListen => {
                connection.send("start")?;
                Ok(Vec::new())
            }
            CansCountCmds::ListenWithDuration(duration) => {
                let cursor = connection.send("start")?;
                std::thread::sleep(std::time::Duration::from_secs(*duration as u64));
                let stop_cursor = connection.send("stop")?;
                let _ = connection.wait_for_any(
                    stop_cursor,
                    &["{\"status\""],
                    &[],
                    200, // should show up in the buffer within this time frame - instant
                    || false,
                );
                let buffer = connection.lines_since(cursor)?;
                Ok(process_buffer(buffer))
            }
        }
    }
}

/*
    Frontend usage:
    invoke('cans_listen', 'stop') to stop listening for can counts.
    invoke('cans_listen', 'start') to start listening for can counts.
    invoke('cans_listen', 'listen', seconds) to listen for can counts for a default duration of 3 seconds.
*/

#[tauri::command]
pub async fn cans_listen(
    command: Option<String>,
    duration: Option<u8>,
) -> Result<Vec<CanColCount>, String> {
    let cmd = match command.as_deref() {
        Some("stop") => CansCountCmds::StopListen,
        Some("start") => CansCountCmds::StartListen,
        Some("listen") => CansCountCmds::ListenWithDuration(duration.unwrap_or(3)),
        _ => return Err("invalid can-counter command".to_string()),
    };
    cmd.execute()
}

#[derive(Serialize)]
pub struct CanLivePoll {
    pub counts: Vec<CanColCount>,
    pub cursor: u64,
}

#[tauri::command]
pub async fn cans_listen_live_start() -> Result<u64, String> {
    let connection = serial_comms::can_counter_connection()?;
    connection.send("start")
}

#[tauri::command]
pub async fn cans_listen_live_poll(cursor: u64) -> Result<CanLivePoll, String> {
    let connection = serial_comms::can_counter_connection()?;
    let (buffer, next_cursor) = connection.lines_since_with_seq(cursor)?;
    let counts = process_buffer(buffer);
    Ok(CanLivePoll {
        counts,
        cursor: next_cursor,
    })
}

fn process_buffer(buffer: Vec<String>) -> Vec<CanColCount> {
    let buffer = buffer
        .iter()
        .flat_map(|line| parse_can_count_line(line))
        .collect::<Vec<CanColCount>>();
    buffer
}

fn parse_can_count_line(line: &str) -> Vec<CanColCount> {
    let trimmed = line.trim();

    if let Ok(counts) = serde_json::from_str::<Vec<CanColCount>>(trimmed) {
        return counts;
    }

    if let Ok(count) = serde_json::from_str::<CanColCount>(trimmed) {
        return vec![count];
    }

    // Some firmware emits each array item separately, leaving the final `]` on the item line.
    let object_fragment = trimmed.trim_end_matches(']').trim_end_matches(',').trim();
    if let Ok(count) = serde_json::from_str::<CanColCount>(object_fragment) {
        return vec![count];
    }

    Vec::new()
}




/*
    // this code uses the arduino uno Q which runs on this:

    #include <Wire.h>
    #include "Adafruit_VL53L0X.h"

    bool listening = false;
    bool listeningRaw = false;
    unsigned long lastUpdateTime = 0;
    unsigned long lastRawUpdateTime = 0;

    const char CMD_START[] = "start";
    const char CMD_STOP[] = "stop";
    const char CMD_LISTEN_RAW[] = "listen_raw";

    const int NUM_COLUMNS = 1;
    const unsigned long UPDATE_INTERVAL_MS = 1000;
    const int XSHUT_PINS[NUM_COLUMNS] = { 2 };                 // unique i2c pins for each sensor
    const uint8_t SENSOR_ADDRESSES[NUM_COLUMNS] = { 0x30 };    // unique I2C address for each sensor
    const float ONE_CAN_DISTANCE_MM[NUM_COLUMNS] = { 530.0 };  // distance that represents 1 can
    const float CAN_PITCH_MM[NUM_COLUMNS] = { 61.0 };          // distance of can pitch
    const float EMPTY_BAND_MIN_MM[NUM_COLUMNS] = { 520.0 };    // above this is potentially 0 cans
    const int NUM_READINGS = 10;                               // readings to average per second


    Adafruit_VL53L0X sensors[NUM_COLUMNS];


    // return 0 if in range of a and b else return minimum 1. anything else is fine.
    int rangeCheck(int value, int a, int b) {
    if (value >= a && value <= b) {
        return 0;
    }
    return 1;
    }


    float getAverageDistance(int column) {
    long total = 0;
    int validReadings = 0;

    for (int i = 0; i < NUM_READINGS; i++) {
        VL53L0X_RangingMeasurementData_t measure;
        sensors[column].rangingTest(&measure, false);

        if (measure.RangeStatus != 4) {
        total += measure.RangeMilliMeter;
        validReadings++;
        }

        delay(5);
    }

    if (validReadings == 0) {
        return -1.0;
    }

    return (float)total / (float)validReadings;
    }



    void initSensors() {

    for (int i = 0; i < NUM_COLUMNS; i++) {
        pinMode(XSHUT_PINS[i], OUTPUT);
        digitalWrite(XSHUT_PINS[i], LOW);
    }

    delay(20);

    for (int i = 0; i < NUM_COLUMNS; i++) {
        digitalWrite(XSHUT_PINS[i], HIGH);
        delay(10);

        if (!sensors[i].begin(SENSOR_ADDRESSES[i], false, &Wire)) {
        Serial.print("{\"error\": \"sensor_");
        Serial.print(i + 1);
        Serial.println("_init_failed\"}");
        }
    }
    }



    /*
        Calculates the number of cans based on the average distance measured by the sensor.
        Returns 0 if the distance falls greater than EMPTY_BAND_MIN_MM.
        Returns at least 1 if the distance is below the one-can distance, adding more for every pitch step closer.
    */
    int calculateCanCount(int column, float distance) {
    if (distance > EMPTY_BAND_MIN_MM[column]) {
        return 0;
    }

    float difference = ONE_CAN_DISTANCE_MM[column] - distance;
    int additionalCans = round(difference / CAN_PITCH_MM[column]);

    int count = 1 + additionalCans;

    if (count < 0) {
        count = 0;
    }

    return count;
    }




    void sendCanCounts() {
    Serial.print("[");

    for (int i = 0; i < NUM_COLUMNS; i++) {
        float avgDistance = getAverageDistance(i);

        int count = 0;

        if (avgDistance >= 0) {
        count = calculateCanCount(i, avgDistance);
        }

        Serial.print("{\"column\": ");
        Serial.print(i); // start from 0
        Serial.print(", \"count\": ");
        Serial.print(count);
        Serial.print(", \"live_distance\": ");

        if (avgDistance < 0) {
        Serial.print("null");
        } else {
        Serial.print(avgDistance);
        }

        Serial.print("}");

        if (i < NUM_COLUMNS - 1) {
        Serial.print(", ");
        }
        i+=1;
    }

    Serial.println("]");
    }



    void sendDistances() {
    Serial.print("{");

    for (int i = 0; i < NUM_COLUMNS; i++) {
        float avgDistance = getAverageDistance(i);

        Serial.print("\"distance_column_");
        Serial.print(i + 1);
        Serial.print("\": ");

        if (avgDistance < 0) {
        Serial.print("null");
        } else {
        Serial.print(avgDistance);
        }

        if (i < NUM_COLUMNS - 1) {
        Serial.print(", ");
        }
    }

    Serial.println("}");
    }




    void handleSerial() {
    static String command = "";

    while (Serial.available()) {
        char c = Serial.read();

        if (c == '\n' || c == '\r') {
        command.trim();

        if (command.equals(CMD_START)) {
            Serial.println("{\"status\": \"started\"}");
            listening = true;
        } else if (command.equals(CMD_STOP)) {
            Serial.println("{\"status\": \"stopped\"}");
            listening = false;
            listeningRaw = false;
        } else if (command.equals(CMD_LISTEN_RAW)) {
            Serial.println("{\"status\": \"raw_started\"}");
            listeningRaw = true;
        } else if (command.length() > 0) {
            Serial.print("{\"error\": \"unknown_command\", \"command\": \"");
            Serial.print(command);
            Serial.println("\"}");
        }

        command = "";
        } else {
        command += c;
        }
    }
    }




    void setup() {
    Serial.begin(115200);

    Wire.begin();

    initSensors();
    }




    void loop() {
    handleSerial();

    if (listening && millis() - lastUpdateTime >= UPDATE_INTERVAL_MS) {
        lastUpdateTime = millis();
        sendCanCounts();
    }

    if (listeningRaw && millis() - lastRawUpdateTime >= UPDATE_INTERVAL_MS) {
        lastRawUpdateTime = millis();
        sendDistances();
    }
    }
*/