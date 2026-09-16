// Persistent, role-aware serial device manager.
// Auto-detects USB serial devices on connect and assigns them a role
// (PicoVend payment bridge or CADLOCK door controller) by probing each
// port with an identifying command, then keeps a background reader thread
// per device so commands and status lines never block each other.

use crate::config as C;
use serde_json::Value;
use serialport::{
    DataBits, FlowControl, Parity, SerialPort, SerialPortInfo, SerialPortType, StopBits,
};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, ErrorKind};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

const SERIAL_READ_TIMEOUT_MS: u64 = 50;
const COMMAND_WRITE_TIMEOUT_MS: u64 = 1_000;
const PROBE_TIMEOUT_MS: u64 = 500;
const MAX_BUFFERED_LINES: usize = 256;

static STATUS_RUNNING: AtomicBool = AtomicBool::new(false);
static REGISTRY: OnceLock<Mutex<DeviceRegistry>> = OnceLock::new();

#[derive(Clone, Debug, PartialEq, Eq)]
enum DeviceRole {
    Payment,
    Door,
}

#[allow(dead_code)]
#[derive(Clone, Debug)]
struct DeviceDescriptor {
    identity: String,
    port_name: String,
    role: DeviceRole,
    device_id: Option<String>,
}

#[derive(Clone, Debug)]
struct BufferedLine {
    sequence: u64,
    value: String,
}

#[derive(Debug)]
struct ConnectionState {
    connected: bool,
    next_sequence: u64,
    lines: VecDeque<BufferedLine>,
    last_error: Option<String>,
}

enum WorkerCommand {
    Send {
        command: String,
        result: mpsc::Sender<Result<u64, String>>,
    },
    Stop,
}

pub(crate) struct DeviceConnection {
    descriptor: DeviceDescriptor,
    commands: mpsc::Sender<WorkerCommand>,
    state: Arc<(Mutex<ConnectionState>, Condvar)>,
}

impl DeviceConnection {
    fn spawn(
        descriptor: DeviceDescriptor,
        port: Box<dyn SerialPort>,
        initial_lines: Vec<String>,
    ) -> Arc<Self> {
        let (commands, receiver) = mpsc::channel();
        let state = Arc::new((
            Mutex::new(ConnectionState {
                connected: true,
                next_sequence: 0,
                lines: VecDeque::new(),
                last_error: None,
            }),
            Condvar::new(),
        ));

        for line in initial_lines {
            push_line(&state, line);
        }

        let connection = Arc::new(Self {
            descriptor,
            commands,
            state: Arc::clone(&state),
        });

        if let Err(e) = std::thread::Builder::new()
            .name(format!(
                "serial-{}",
                connection.descriptor.identity.replace('/', "_")
            ))
            .spawn(move || serial_worker(port, receiver, state))
        {
            eprintln!("failed to start serial worker for {}: {e}", connection.descriptor.identity);
            return connection;
        }

        connection
    }

    pub(crate) fn port_name(&self) -> &str {
        &self.descriptor.port_name
    }

    #[allow(dead_code)]
    pub(crate) fn device_id(&self) -> Option<&str> {
        self.descriptor.device_id.as_deref()
    }

    pub(crate) fn is_connected(&self) -> bool {
        self.state
            .0
            .lock()
            .map(|state| state.connected)
            .unwrap_or(false)
    }

    pub(crate) fn send(&self, command: &str) -> Result<u64, String> {
        if !self.is_connected() {
            return Err(self.connection_error());
        }

        let (result_tx, result_rx) = mpsc::channel();
        self.commands
            .send(WorkerCommand::Send {
                command: command.to_string(),
                result: result_tx,
            })
            .map_err(|_| self.connection_error())?;

        result_rx
            .recv_timeout(Duration::from_millis(COMMAND_WRITE_TIMEOUT_MS))
            .map_err(|_| format!("Timed out writing to {}", self.port_name()))?
    }

    pub(crate) fn command_wait(
        &self,
        command: &str,
        expected_prefixes: &[&str],
        failure_prefixes: &[&str],
        timeout_ms: u64,
    ) -> Result<String, String> {
        let cursor = self.send(command)?;
        self.wait_for_any(
            cursor,
            expected_prefixes,
            failure_prefixes,
            timeout_ms,
            || false,
        )
    }

    pub(crate) fn wait_for_any<F>(
        &self,
        cursor: u64,
        expected_prefixes: &[&str],
        failure_prefixes: &[&str],
        timeout_ms: u64,
        cancelled: F,
    ) -> Result<String, String>
    where
        F: Fn() -> bool,
    {
        let deadline = Instant::now() + Duration::from_millis(timeout_ms);
        let (lock, available) = &*self.state;
        let mut state = lock
            .lock()
            .map_err(|_| "Serial state poisoned".to_string())?;

        loop {
            for line in state.lines.iter().filter(|line| line.sequence >= cursor) {
                if failure_prefixes
                    .iter()
                    .any(|prefix| line.value.starts_with(prefix))
                {
                    return Err(format!("Device rejected command: {}", line.value));
                }
                if expected_prefixes
                    .iter()
                    .any(|prefix| line.value.starts_with(prefix))
                {
                    return Ok(line.value.clone());
                }
            }

            if cancelled() {
                return Err("Operation cancelled".to_string());
            }
            if !state.connected {
                return Err(state
                    .last_error
                    .clone()
                    .unwrap_or_else(|| format!("{} disconnected", self.port_name())));
            }

            let now = Instant::now();
            if now >= deadline {
                let recent = state
                    .lines
                    .iter()
                    .filter(|line| line.sequence >= cursor)
                    .map(|line| line.value.as_str())
                    .collect::<Vec<_>>()
                    .join(" | ");
                return Err(format!(
                    "Timed out waiting for [{}] on {}{}",
                    expected_prefixes.join(", "),
                    self.port_name(),
                    if recent.is_empty() {
                        String::new()
                    } else {
                        format!("; received: {recent}")
                    }
                ));
            }

            let wait_for = (deadline - now).min(Duration::from_millis(100));
            let (next_state, _) = available
                .wait_timeout(state, wait_for)
                .map_err(|_| "Serial state poisoned".to_string())?;
            state = next_state;
        }
    }

    fn connection_error(&self) -> String {
        self.state
            .0
            .lock()
            .ok()
            .and_then(|state| state.last_error.clone())
            .unwrap_or_else(|| format!("{} is disconnected", self.port_name()))
    }
}

impl Drop for DeviceConnection {
    fn drop(&mut self) {
        let _ = self.commands.send(WorkerCommand::Stop);
    }
}

#[derive(Default)]
struct DeviceRegistry {
    payment: Option<Arc<DeviceConnection>>,
    doors: HashMap<String, Arc<DeviceConnection>>,
}

impl DeviceRegistry {
    fn refresh(&mut self) -> Result<(), String> {
        let ports = usb_ports()?;
        let mut identity_counts = HashMap::new();
        for info in &ports {
            *identity_counts
                .entry(device_identity(info))
                .or_insert(0usize) += 1;
        }

        let identified_ports = ports
            .into_iter()
            .map(|info| {
                let base_identity = device_identity(&info);
                let identity = if identity_counts.get(&base_identity).copied().unwrap_or(0) > 1 {
                    format!("{base_identity}@{}", stable_port_name(&info.port_name))
                } else {
                    base_identity
                };
                (info, identity)
            })
            .collect::<Vec<_>>();

        let available_identities = identified_ports
            .iter()
            .map(|(_, identity)| identity.to_string())
            .collect::<Vec<String>>();

        if self.payment.as_ref().is_some_and(|connection| {
            !connection.is_connected()
                || !available_identities.contains(&connection.descriptor.identity)
        }) {
            self.payment = None;
        }

        self.doors.retain(|identity, connection| {
            connection.is_connected() && available_identities.contains(identity)
        });

        for (info, identity) in identified_ports {
            let already_managed = self
                .payment
                .as_ref()
                .is_some_and(|connection| connection.descriptor.identity == identity)
                || self.doors.contains_key(&identity);
            if already_managed {
                continue;
            }

            match probe_device(&info, identity.clone()) {
                Ok((descriptor, port, initial_lines)) => {
                    let role = descriptor.role.clone();
                    let connection = DeviceConnection::spawn(descriptor, port, initial_lines);
                    match role {
                        DeviceRole::Payment if self.payment.is_none() => {
                            self.payment = Some(connection);
                        }
                        DeviceRole::Door => {
                            self.doors.insert(identity, connection);
                        }
                        DeviceRole::Payment => {
                            eprintln!(
                                "Ignoring additional payment bridge on {} because one is already assigned",
                                connection.port_name()
                            );
                        }
                    }
                }
                Err(error) => {
                    eprintln!("Serial device {} was not assigned: {error}", info.port_name);
                }
            }
        }

        Ok(())
    }
}

fn registry() -> &'static Mutex<DeviceRegistry> {
    REGISTRY.get_or_init(|| Mutex::new(DeviceRegistry::default()))
}

pub(crate) fn payment_connection() -> Result<Arc<DeviceConnection>, String> {
    let mut registry = registry()
        .lock()
        .map_err(|_| "Serial registry poisoned".to_string())?;
    registry.refresh()?;
    registry
        .payment
        .clone()
        .ok_or_else(|| "PicoVend payment bridge not found".to_string())
}

fn door_connections() -> Result<Vec<Arc<DeviceConnection>>, String> {
    let mut registry = registry()
        .lock()
        .map_err(|_| "Serial registry poisoned".to_string())?;
    registry.refresh()?;
    Ok(registry.doors.values().cloned().collect())
}

#[tauri::command]
pub fn kill_polling() {
    if C::CONFIG.kill_polling {
        let _ = broadcast_cmd_to_all_ports("poll off");
    }
}

#[tauri::command]
pub fn get_all_serial_ports() -> Vec<String> {
    usb_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|port| stable_port_name(&port.port_name))
        .collect()
}

#[tauri::command]
pub fn broadcast_cmd_to_all_ports(cmd: &str) -> Result<(), String> {
    let doors = door_connections()?;
    if doors.is_empty() {
        return Err("No CADLOCK door controllers found".to_string());
    }

    let mut errors = Vec::new();
    let mut sent = 0usize;
    for door in doors {
        match door.send(cmd) {
            Ok(_) => sent += 1,
            Err(error) => errors.push(format!("{}: {error}", door.port_name())),
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Command reached {sent} controller(s), but failed on {}",
            errors.join("; ")
        ))
    }
}

struct StatusGuard;

impl Drop for StatusGuard {
    fn drop(&mut self) {
        STATUS_RUNNING.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn status() -> Vec<String> {
    if STATUS_RUNNING.swap(true, Ordering::SeqCst) {
        return vec![];
    }
    let _guard = StatusGuard;

    let doors = match door_connections() {
        Ok(doors) => doors,
        Err(error) => {
            eprintln!("Could not refresh CADLOCK connections: {error}");
            return vec![];
        }
    };

    let mut results = Vec::new();
    for door in doors {
        let cursor = match door.send("s") {
            Ok(cursor) => cursor,
            Err(error) => {
                eprintln!(
                    "CADLOCK status write failed on {}: {error}",
                    door.port_name()
                );
                continue;
            }
        };

        match door.wait_for_any(
            cursor,
            &["{"],
            &[],
            C::CONFIG.timeouts.status_ms as u64,
            || false,
        ) {
            Ok(raw) if serde_json::from_str::<Value>(&raw).is_ok() => results.push(raw),
            Ok(raw) => eprintln!(
                "CADLOCK returned invalid status on {}: {raw}",
                door.port_name()
            ),
            Err(error) => eprintln!("CADLOCK status failed on {}: {error}", door.port_name()),
        }
    }

    results
}

pub fn extract_field(raw: &str, key: &str) -> Option<String> {
    for pattern in &[format!("\"{}\":\"", key), format!("\"{}\": \"", key)] {
        if let Some(pos) = raw.find(pattern.as_str()) {
            let start = pos + pattern.len();
            if let Some(val) = raw[start..].split('"').next() {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn usb_ports() -> Result<Vec<SerialPortInfo>, String> {
    serialport::available_ports()
        .map(|ports| {
            ports
                .into_iter()
                .filter(|port| matches!(port.port_type, SerialPortType::UsbPort(_)))
                .collect()
        })
        .map_err(|error| format!("Unable to enumerate USB serial ports: {error}"))
}

fn device_identity(info: &SerialPortInfo) -> String {
    match &info.port_type {
        SerialPortType::UsbPort(usb) => usb
            .serial_number
            .as_deref()
            .filter(|serial| !serial.trim().is_empty())
            .map(|serial| format!("usb:{:04x}:{:04x}:{serial}", usb.vid, usb.pid))
            .unwrap_or_else(|| format!("path:{}", stable_port_name(&info.port_name))),
        _ => format!("path:{}", stable_port_name(&info.port_name)),
    }
}

fn configured_port(port_name: &str) -> serialport::SerialPortBuilder {
    serialport::new(port_name, C::CONFIG.baud)
        .data_bits(DataBits::Eight)
        .stop_bits(StopBits::One)
        .parity(Parity::None)
        .flow_control(FlowControl::None)
        .timeout(Duration::from_millis(SERIAL_READ_TIMEOUT_MS))
}

fn probe_device(
    info: &SerialPortInfo,
    identity: String,
) -> Result<(DeviceDescriptor, Box<dyn SerialPort>, Vec<String>), String> {
    let port_name = stable_port_name(&info.port_name);
    let mut port = configured_port(&port_name)
        .open()
        .map_err(|error| format!("Unable to open {port_name}: {error}"))?;

    std::thread::sleep(Duration::from_millis(50));

    let mut lines = Vec::new();
    write_protocol_line(&mut *port, "ALIVE?")?;
    if read_probe_lines(&mut port, &mut lines, PROBE_TIMEOUT_MS, |line| {
        line.starts_with("ALIVEACK")
    })? {
        let descriptor = DeviceDescriptor {
            identity,
            port_name,
            role: DeviceRole::Payment,
            device_id: None,
        };
        return Ok((descriptor, port, lines));
    }

    write_protocol_line(&mut *port, "s")?;
    if read_probe_lines(&mut port, &mut lines, PROBE_TIMEOUT_MS, |line| {
        line.starts_with('{') && serde_json::from_str::<Value>(line).is_ok()
    })? {
        let device_id = lines.iter().rev().find_map(|line| {
            serde_json::from_str::<Value>(line)
                .ok()
                .and_then(|value| value["device_id"].as_str().map(ToString::to_string))
        });
        let descriptor = DeviceDescriptor {
            identity,
            port_name,
            role: DeviceRole::Door,
            device_id,
        };
        return Ok((descriptor, port, lines));
    }

    Err("device did not identify as PicoVend or CADLOCK".to_string())
}

fn read_probe_lines<F>(
    port: &mut Box<dyn SerialPort>,
    collected: &mut Vec<String>,
    timeout_ms: u64,
    matched: F,
) -> Result<bool, String>
where
    F: Fn(&str) -> bool,
{
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let mut reader = BufReader::new(port);
    let mut line = String::new();

    while Instant::now() < deadline {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => continue,
            Ok(_) => {
                let value = line.trim().to_string();
                if value.is_empty() {
                    continue;
                }
                let is_match = matched(&value);
                collected.push(value);
                if is_match {
                    return Ok(true);
                }
            }
            Err(error) if is_timeout(&error) => continue,
            Err(error) => return Err(format!("Probe read failed: {error}")),
        }
    }

    Ok(false)
}

fn serial_worker(
    port: Box<dyn SerialPort>,
    commands: mpsc::Receiver<WorkerCommand>,
    state: Arc<(Mutex<ConnectionState>, Condvar)>,
) {
    let mut reader = BufReader::new(port);
    let mut line = String::new();

    loop {
        loop {
            match commands.try_recv() {
                Ok(WorkerCommand::Send { command, result }) => {
                    let write_result = write_protocol_line(reader.get_mut().as_mut(), &command);
                    if let Err(error) = &write_result {
                        mark_disconnected(&state, error.clone());
                    }
                    let failed = write_result.is_err();
                    let cursor = write_result.and_then(|_| next_sequence(&state));
                    let _ = result.send(cursor);
                    if failed {
                        return;
                    }
                }
                Ok(WorkerCommand::Stop) => return,
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => return,
            }
        }

        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => continue,
            Ok(_) => {
                let value = line.trim().to_string();
                if !value.is_empty() {
                    push_line(&state, value);
                }
            }
            Err(error) if is_timeout(&error) => continue,
            Err(error) => {
                mark_disconnected(&state, format!("Serial read failed: {error}"));
                return;
            }
        }
    }
}

fn write_protocol_line(port: &mut dyn SerialPort, command: &str) -> Result<(), String> {
    let line = format!("{command}\r\n");
    port.write_all(line.as_bytes())
        .map_err(|error| format!("Serial write failed: {error}"))?;
    port.flush()
        .map_err(|error| format!("Serial flush failed: {error}"))
}

fn push_line(state: &Arc<(Mutex<ConnectionState>, Condvar)>, value: String) {
    let (lock, available) = &**state;
    if let Ok(mut state) = lock.lock() {
        let sequence = state.next_sequence;
        state.next_sequence = state.next_sequence.wrapping_add(1);
        state.lines.push_back(BufferedLine { sequence, value });
        while state.lines.len() > MAX_BUFFERED_LINES {
            state.lines.pop_front();
        }
        available.notify_all();
    }
}

fn next_sequence(state: &Arc<(Mutex<ConnectionState>, Condvar)>) -> Result<u64, String> {
    state
        .0
        .lock()
        .map(|state| state.next_sequence)
        .map_err(|_| "Serial state poisoned".to_string())
}

fn mark_disconnected(state: &Arc<(Mutex<ConnectionState>, Condvar)>, error: String) {
    let (lock, available) = &**state;
    if let Ok(mut state) = lock.lock() {
        state.connected = false;
        state.last_error = Some(error);
        available.notify_all();
    }
}

fn is_timeout(error: &std::io::Error) -> bool {
    matches!(error.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock)
}

#[cfg(target_os = "linux")]
fn stable_port_name(port_name: &str) -> String {
    let canonical_port = std::fs::canonicalize(port_name).ok();
    for root in ["/dev/serial/by-id", "/dev/serial/by-path"] {
        let Ok(entries) = std::fs::read_dir(root) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if std::fs::canonicalize(&path).ok() == canonical_port {
                return path.to_string_lossy().into_owned();
            }
        }
    }
    port_name.to_string()
}

#[cfg(not(target_os = "linux"))]
fn stable_port_name(port_name: &str) -> String {
    port_name.to_string()
}
