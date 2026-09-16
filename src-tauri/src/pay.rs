// Direct serial replacement for the old Python (app_vend.py) Nayax MDB bridge.
// Speaks the same CSLS cashless protocol, but over the persistent serial manager.
// ported in from the express repo

use crate::serial_comms::{payment_connection, DeviceConnection};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Emitter;

const CASHLESS_X: u8 = 1;
const READY_TIMEOUT_MS: u64 = 20_000;
const COMMAND_TIMEOUT_MS: u64 = 3_000;
const CARD_TAP_TIMEOUT_MS: u64 = 30_000;
const VNDAPP_TIMEOUT_MS: u64 = 30_000;
const SESSION_END_TIMEOUT_MS: u64 = 2_000;
const EARLY_DENIAL_WINDOW_MS: u64 = 1_000;
const STALE_SESSION_RETRY_DELAY_MS: u64 = 750;

static PAYMENT_ENABLED: AtomicBool = AtomicBool::new(false);
static PAYMENT_RUNNING: AtomicBool = AtomicBool::new(false);
static PAYMENT_APPROVED: AtomicBool = AtomicBool::new(false);
static PAYMENT_GENERATION: AtomicU64 = AtomicU64::new(0);

struct PaymentGuard {
    generation: u64,
}

impl Drop for PaymentGuard {
    fn drop(&mut self) {
        if PAYMENT_GENERATION.load(Ordering::SeqCst) == self.generation {
            PAYMENT_RUNNING.store(false, Ordering::SeqCst);
        }
    }
}

#[tauri::command]
pub async fn initialize_payment_device() -> Result<String, String> {
    let connection = payment_connection()?;
    initialize_connection(&connection)?;
    Ok(connection.port_name().to_string())
}

fn initialize_connection(connection: &Arc<DeviceConnection>) -> Result<(), String> {
    reset_and_wait_ready(connection)?;
    ensure_normal_vend_mode(connection)?;
    disable_payment_device(connection)?;
    PAYMENT_APPROVED.store(false, Ordering::SeqCst);
    Ok(())
}

fn reset_and_wait_ready(connection: &Arc<DeviceConnection>) -> Result<(), String> {
    let cursor = connection.send(&format!("CSLS{}RESET", CASHLESS_X))?;
    connection.wait_for_any(
        cursor,
        &[&format!("CSLS{}READY", CASHLESS_X)],
        &[&format!("CSLS{}RESETFAIL", CASHLESS_X)],
        READY_TIMEOUT_MS,
        || false,
    )?;
    Ok(())
}

fn ensure_normal_vend_mode(connection: &Arc<DeviceConnection>) -> Result<(), String> {
    let basket_prefix = format!("CSLS{}BASKET(", CASHLESS_X);
    let basket = connection.command_wait(
        &format!("CSLS{}BASKET?", CASHLESS_X),
        &[&basket_prefix],
        &[&format!("CSLS{}BASKETFAIL", CASHLESS_X)],
        COMMAND_TIMEOUT_MS,
    );

    // Older bridges do not implement basket commands. They already operate in normal mode.
    let Ok(basket) = basket else {
        return Ok(());
    };

    if !basket.ends_with("(1)") {
        return Ok(());
    }

    connection.command_wait(
        &format!("CSLS{}BASKET(0)", CASHLESS_X),
        &[&format!("CSLS{}BASKETOK", CASHLESS_X)],
        &[&format!("CSLS{}BASKETFAIL", CASHLESS_X)],
        COMMAND_TIMEOUT_MS,
    )?;
    connection.command_wait(
        "SAVESETTINGS",
        &["SAVESETTINGSOK"],
        &["SAVESETTINGSFAIL"],
        COMMAND_TIMEOUT_MS,
    )?;
    reset_and_wait_ready(connection)
}

fn ensure_payment_device_ready(connection: &Arc<DeviceConnection>) -> Result<(), String> {
    connection.command_wait("ALIVE?", &["ALIVEACK"], &[], COMMAND_TIMEOUT_MS)?;

    match connection.command_wait(
        &format!("CSLS{}INITED?", CASHLESS_X),
        &[&format!("CSLS{}INITEDOK", CASHLESS_X)],
        &[&format!("CSLS{}NOTINITED", CASHLESS_X)],
        COMMAND_TIMEOUT_MS,
    ) {
        Ok(_) => Ok(()),
        Err(_) => reset_and_wait_ready(connection),
    }
}

fn enable_payment_device(connection: &Arc<DeviceConnection>) -> Result<(), String> {
    connection.command_wait(
        &format!("CSLS{}ENABLE", CASHLESS_X),
        &[
            &format!("CSLS{}ENABLEOK", CASHLESS_X),
            &format!("CSLS{}ENABLED", CASHLESS_X),
        ],
        &[&format!("CSLS{}ENABLEFAIL", CASHLESS_X)],
        COMMAND_TIMEOUT_MS,
    )?;
    PAYMENT_ENABLED.store(true, Ordering::SeqCst);
    Ok(())
}

fn disable_payment_device(connection: &Arc<DeviceConnection>) -> Result<(), String> {
    let result = connection.command_wait(
        &format!("CSLS{}DISABLE", CASHLESS_X),
        &[
            &format!("CSLS{}DISABLEOK", CASHLESS_X),
            &format!("CSLS{}DISABLED", CASHLESS_X),
        ],
        &[&format!("CSLS{}DISABLEFAIL", CASHLESS_X)],
        COMMAND_TIMEOUT_MS,
    );
    PAYMENT_ENABLED.store(false, Ordering::SeqCst);

    if result.is_ok() {
        return Ok(());
    }

    // Some devices reject DISABLE when they are already inactive. Verify that state.
    connection.command_wait(
        &format!("CSLS{}ACTIVE?", CASHLESS_X),
        &[&format!("CSLS{}NOTACTIVE", CASHLESS_X)],
        &[],
        COMMAND_TIMEOUT_MS,
    )?;
    Ok(())
}

#[tauri::command]
pub async fn start_payment(
    payment_port: &str,
    app: tauri::AppHandle,
    amount: f64,
) -> Result<(), String> {
    let connection = payment_connection()?;
    if connection.port_name() != payment_port {
        eprintln!(
            "Stored payment port {payment_port} changed; using reconnected device {}",
            connection.port_name()
        );
    }

    if !amount.is_finite() || amount < 0.0 {
        return Err("Payment amount must be a finite, non-negative value".to_string());
    }
    let price = (amount * 100.0).round();
    if price > u16::MAX as f64 {
        return Err(format!(
            "Payment amount exceeds the PicoVend maximum of {} minor units",
            u16::MAX
        ));
    }

    if PAYMENT_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Payment already in progress".to_string());
    }

    let generation = PAYMENT_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    PAYMENT_APPROVED.store(false, Ordering::SeqCst);

    if price == 0.0 {
        let _ = app.emit("payment-result", true);
        PAYMENT_RUNNING.store(false, Ordering::SeqCst);
        return Ok(());
    }

    tokio::task::spawn_blocking(move || {
        let _guard = PaymentGuard { generation };
        let approved = run_payment(&connection, price as u16, generation);
        let still_current = PAYMENT_GENERATION.load(Ordering::SeqCst) == generation;

        match approved {
            Ok(true) if still_current => {
                PAYMENT_APPROVED.store(true, Ordering::SeqCst);
                let _ = app.emit("payment-result", true);
            }
            Ok(_) if still_current => {
                PAYMENT_APPROVED.store(false, Ordering::SeqCst);
                let _ = disable_payment_device(&connection);
                let _ = app.emit("payment-result", false);
            }
            Err(error) if still_current => {
                eprintln!("Payment failed: {error}");
                PAYMENT_APPROVED.store(false, Ordering::SeqCst);
                let _ = cancel_and_disable(&connection);
                let _ = app.emit("payment-result", false);
            }
            _ => {
                // A cancellation or newer attempt superseded this worker. Never emit a stale result.
            }
        }
    });

    Ok(())
}

fn run_payment(
    connection: &Arc<DeviceConnection>,
    price: u16,
    generation: u64,
) -> Result<bool, String> {
    let not_same_pay_attempt = || PAYMENT_GENERATION.load(Ordering::SeqCst) != generation;

    if not_same_pay_attempt() {
        return Err("Operation cancelled".to_string());
    }

    let _ = ensure_payment_device_ready(connection)
        .map_err(|e| format!("Failed to ensure payment device is ready in run_payment fn: {e}"))?;

    enable_payment_device(connection)
        .map_err(|e| format!("Failed to enable payment device in run_payment fn: {e}"))?;

    let request = format!("CSLS{}VNDREQ({},1)", CASHLESS_X, price);
    let first_outcome = perform_vend_attempt(connection, &request, generation)?;

    if first_outcome.is_approved() {
        return Ok(true);
    }

    if !should_retry_early_denial(&first_outcome, false) {
        return Ok(false);
    }

    recycle_payment_device_for_stale_session(connection, generation)?;
    wait_with_cancellation(STALE_SESSION_RETRY_DELAY_MS, generation)?;

    let retry_outcome = perform_vend_attempt(connection, &request, generation)?;
    // The retry is always terminal, even if Nayax denies it inside the early window again.
    Ok(retry_outcome.is_approved())
}

fn recycle_payment_device_for_stale_session(
    connection: &Arc<DeviceConnection>,
    generation: u64,
) -> Result<(), String> {
    disable_payment_device(connection)?;
    connection.command_wait(
        &format!("CSLS{}ACTIVE?", CASHLESS_X),
        &[&format!("CSLS{}NOTACTIVE", CASHLESS_X)],
        &[],
        COMMAND_TIMEOUT_MS,
    )?;
    if PAYMENT_GENERATION.load(Ordering::SeqCst) != generation {
        return Err("Operation cancelled".to_string());
    }

    let cursor = connection.send(&format!("CSLS{}ENABLE", CASHLESS_X))?;
    connection.wait_for_any(
        cursor,
        &[&format!("CSLS{}ENABLED", CASHLESS_X)],
        &[&format!("CSLS{}ENABLEFAIL", CASHLESS_X)],
        COMMAND_TIMEOUT_MS,
        || PAYMENT_GENERATION.load(Ordering::SeqCst) != generation,
    )?;
    PAYMENT_ENABLED.store(true, Ordering::SeqCst);
    Ok(())
}

struct VendOutcome {
    message: String,
    latency: Duration,
}

impl VendOutcome {
    fn is_approved(&self) -> bool {
        self.message
            .starts_with(&format!("CSLS{}VNDAPP", CASHLESS_X))
    }

    fn is_denied(&self) -> bool {
        self.message
            .starts_with(&format!("CSLS{}VNDDEN", CASHLESS_X))
    }
}

fn should_retry_early_denial(outcome: &VendOutcome, retry_already_used: bool) -> bool {
    !retry_already_used
        && outcome.is_denied()
        && outcome.latency < Duration::from_millis(EARLY_DENIAL_WINDOW_MS)
}

fn perform_vend_attempt(
    connection: &Arc<DeviceConnection>,
    request: &str,
    generation: u64,
) -> Result<VendOutcome, String> {
    let not_same_pay_attempt = || PAYMENT_GENERATION.load(Ordering::SeqCst) != generation;
    if not_same_pay_attempt() {
        return Err("Operation cancelled!".to_string());
    }
    let mut request_started = Instant::now();
    let mut cursor = connection.send(request)?;

    let mut response = connection.wait_for_any(
        cursor,
        &[
            &format!("CSLS{}VNDREQOK", CASHLESS_X),
            &format!("CSLS{}NOSESSION", CASHLESS_X),
            &format!("CSLS{}VNDAPP", CASHLESS_X),
            &format!("CSLS{}VNDDEN", CASHLESS_X),
        ],
        &[
            &format!("CSLS{}VNDREQFAIL", CASHLESS_X),
            &format!("CSLS{}BASKETMODE", CASHLESS_X),
            &format!("CSLS{}CMDOUTOFSEQ", CASHLESS_X),
            &format!("CSLS{}MALFUNCTION", CASHLESS_X),
        ],
        COMMAND_TIMEOUT_MS,
        not_same_pay_attempt,
    )?;

    if response.starts_with(&format!("CSLS{}NOSESSION", CASHLESS_X)) {
        connection.wait_for_any(
            cursor,
            &[&format!("CSLS{}BEGIN", CASHLESS_X)],
            &[
                &format!("CSLS{}CANCELED", CASHLESS_X),
                &format!("CSLS{}MALFUNCTION", CASHLESS_X),
            ],
            CARD_TAP_TIMEOUT_MS,
            not_same_pay_attempt,
        )?;
        request_started = Instant::now();
        cursor = connection.send(request)?;
        response = connection.wait_for_any(
            cursor,
            &[
                &format!("CSLS{}VNDREQOK", CASHLESS_X),
                &format!("CSLS{}VNDAPP", CASHLESS_X),
                &format!("CSLS{}VNDDEN", CASHLESS_X),
            ],
            &[
                &format!("CSLS{}VNDREQFAIL", CASHLESS_X),
                &format!("CSLS{}BASKETMODE", CASHLESS_X),
                &format!("CSLS{}CMDOUTOFSEQ", CASHLESS_X),
                &format!("CSLS{}MALFUNCTION", CASHLESS_X),
            ],
            COMMAND_TIMEOUT_MS,
            not_same_pay_attempt,
        )?;
    }

    if response.starts_with(&format!("CSLS{}VNDREQOK", CASHLESS_X)) {
        response = connection.wait_for_any(
            cursor,
            &[
                &format!("CSLS{}VNDAPP", CASHLESS_X),
                &format!("CSLS{}VNDDEN", CASHLESS_X),
            ],
            &[
                &format!("CSLS{}CANCELED", CASHLESS_X),
                &format!("CSLS{}CMDOUTOFSEQ", CASHLESS_X),
                &format!("CSLS{}MALFUNCTION", CASHLESS_X),
            ],
            VNDAPP_TIMEOUT_MS,
            not_same_pay_attempt,
        )?;
    }

    Ok(VendOutcome {
        message: response,
        latency: request_started.elapsed(),
    })
}

fn wait_with_cancellation(delay_ms: u64, generation: u64) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_millis(delay_ms);
    while Instant::now() < deadline {
        if PAYMENT_GENERATION.load(Ordering::SeqCst) != generation {
            return Err("Operation cancelled".to_string());
        }
        std::thread::sleep(
            deadline
                .saturating_duration_since(Instant::now())
                .min(Duration::from_millis(25)),
        );
    }

    Ok(())
}

#[tauri::command]
pub fn end_payment(payment_port: &str, success: bool) -> Result<(), String> {
    let connection = payment_connection()?;
    if connection.port_name() != payment_port {
        eprintln!(
            "Stored payment port {payment_port} changed; finalizing on {}",
            connection.port_name()
        );
    }

    if success && !PAYMENT_APPROVED.swap(false, Ordering::SeqCst) {
        return Err("Cannot complete a payment that has not been approved".to_string());
    }

    let settlement_cursor = if success {
        let cursor = connection.send(&format!("CSLS{}VNDSUCC(1)", CASHLESS_X))?;
        connection.wait_for_any(
            cursor,
            &[&format!("CSLS{}VNDSUCCOK", CASHLESS_X)],
            &[
                &format!("CSLS{}VNDSUCCFAIL", CASHLESS_X),
                &format!("CSLS{}NOSESSION", CASHLESS_X),
            ],
            COMMAND_TIMEOUT_MS,
            || false,
        )?;
        cursor
    } else {
        PAYMENT_APPROVED.store(false, Ordering::SeqCst);
        let cursor = connection.send(&format!("CSLS{}VNDFAIL", CASHLESS_X))?;
        connection.wait_for_any(
            cursor,
            &[&format!("CSLS{}VNDFAILOK", CASHLESS_X)],
            &[
                &format!("CSLS{}VNDFAILFAIL", CASHLESS_X),
                &format!("CSLS{}NOSESSION", CASHLESS_X),
            ],
            COMMAND_TIMEOUT_MS,
            || false,
        )?;
        cursor
    };

    // Single-vend readers normally close automatically. Use the documented force-close
    // command, without parameters, only if ENDSESSION was not observed.
    if connection
        .wait_for_any(
            settlement_cursor,
            &[&format!("CSLS{}ENDSESSION", CASHLESS_X)],
            &[],
            SESSION_END_TIMEOUT_MS,
            || false,
        )
        .is_err()
    {
        connection.command_wait(
            &format!("CSLS{}SESSCOMPLETE?", CASHLESS_X),
            &[&format!("CSLS{}SESSCOMPLETEOK", CASHLESS_X)],
            &[&format!("CSLS{}SESSCOMPLETEFAIL", CASHLESS_X)],
            COMMAND_TIMEOUT_MS,
        )?;
    }

    disable_payment_device(&connection)?;
    Ok(())
}

#[tauri::command]
pub fn kill_payment(payment_port: &str) -> Result<(), String> {
    let connection = payment_connection()?;

    PAYMENT_GENERATION.fetch_add(1, Ordering::SeqCst);
    PAYMENT_RUNNING.store(false, Ordering::SeqCst);
    PAYMENT_APPROVED.store(false, Ordering::SeqCst);

    if connection.port_name() != payment_port {
        eprintln!(
            "Stored payment port {payment_port} changed; cancelling on {}",
            connection.port_name()
        );
    }
    cancel_and_disable(&connection)
        .map_err(|e| format!("Failed to cancel and disable payment device: {e}"))?;

    Ok(())
}

fn cancel_and_disable(connection: &Arc<DeviceConnection>) -> Result<(), String> {
    let cancel = connection.command_wait(
        &format!("CSLS{}CANCEL", CASHLESS_X),
        &[
            &format!("CSLS{}CANCELOK", CASHLESS_X),
            &format!("CSLS{}CANCELED", CASHLESS_X),
        ],
        &[&format!("CSLS{}CANCELFAIL", CASHLESS_X)],
        COMMAND_TIMEOUT_MS,
    );
    let disable = disable_payment_device(connection);

    match (cancel, disable) {
        (Ok(_), Ok(())) => Ok(()),
        (Err(cancel_error), Ok(())) => Err(cancel_error),
        (Ok(_), Err(disable_error)) => Err(disable_error),
        (Err(cancel_error), Err(disable_error)) => {
            Err(format!("{cancel_error}; additionally: {disable_error}"))
        }
    }
}
