pub const CONFIG: Config = Config {
    kill_polling: true,
    baud: 115200,
    timeouts: TimeOuts {
        status_ms: 2000,
        serial_ms: 100,
        pay_ms: 30000,
        port_scan_ms: 500,
    },
};

pub struct Config {
    pub kill_polling: bool,
    pub baud: u32,
    pub timeouts: TimeOuts,
}

#[allow(dead_code)]
pub struct TimeOuts {
    pub status_ms: u16,
    pub serial_ms: u16,
    pub pay_ms: u16,
    pub port_scan_ms: u16,
}
