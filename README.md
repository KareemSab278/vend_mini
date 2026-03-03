# Coinadrink Ordering System

A contactless card payment system for PicoVend EZ Bridge vending machines. Built with React (frontend), Tauri (desktop bridge), and Flask (payment logic & hardware communication).
// in order to run this command youll need to first run:
// sudo apt install python3-flask python3-serial

if building on pc then please run sudo apt install gcc-aarch64-linux-gnu first nneayse pi is arm64
then rustup target add aarch64-unknown-linux-gnu
npm run tauri build -- --target aarch64-unknown-linux-gnu

otherwise just build on the pi directly

## System Architecture

```
React App (Frontend)
  |
  | HTTP (invoke commands)
  |
Tauri Bridge (lib.rs)
  |
  | HTTP POST/GET
  |
Flask Server (app_vend.py)
  |
  | Serial (MDB Protocol)
  |
Card Reader Hardware (PicoVend EZ Bridge)
```

### Component Overview

| Component | Role |
|-----------|------|
| **React App** (src/App.jsx) | Product selection UI, payment status display, cart management |
| **Tauri Bridge** (src-tauri/src/lib.rs) | HTTP client that calls Flask endpoints, exposes commands to React |
| **Flask Server** (app_vend.py) | Core payment orchestration, serial communication with card reader, basket state tracking |
| **MDB Hardware** | Physical card reader that processes payments (PicoVend EZ Bridge) |

---

## Payment Flow: Technical Overview

### 1. User Selects Products (React)

- User taps product cards to add items
- Each product is added to the `selectedProducts` array with quantity
- Prices stored as decimals (e.g., £1.25)

### 2. User Initiates Checkout

React calls `handleCheckout()`:

```javascript
const items = selectedProducts.map((p) => ({
  id: p.product_id,
  name: p.product_name,
  price: Math.round(p.product_price * 100),  // Convert to pence
  qty: p.count,
}));

await invoke("initiate_payment", { slot: 1, items });
```

State changes to: `payStatus = "paying"`, `payMessage = "Initiating payment..."`

### 3. Tauri Calls Flask

The `initiate_payment` Tauri command (lib.rs) makes:

```
POST http://127.0.0.1:8080/api/basket/pay
Authorization: Bearer supersecret
Body: {
  "slot": 1,
  "items": [
    {"id": 1, "name": "Cola", "price": 150, "qty": 1},
    ...
  ]
}
```

Response: `{"ok": true}` (returns immediately)

### 4. Flask Spawns Payment Thread

The `_pay_flow()` function runs in the background:

1. Send `CSLS1RESET` to card reader
2. Wait for `CSLS1READY` response
3. Send `CSLS1ENABLE` to activate reader
4. Send `CSLS1VNDREQ(total_price, item_count)` and wait for approval

The card reader responses:
- `CSLS1VNDAPP(...)` = card approved, payment accepted
- `CSLS1VNDDEN` = card declined
- `CSLS1BEGIN(...)` = customer tap detected, waiting for authorization

Flask updates `state.pay` with:
- `approved: true/false`
- `in_progress: true/false`
- `last_status: "..."` (human-readable message)
- `last_error: "..."` (if something failed)

### 5. React Polls for Approval

While `payStatus = "paying"`, React polls `get_pay_state()` every 500ms:

```javascript
setInterval(async () => {
  const state = await invoke("get_pay_state");
  if (state.pay.approved) {
    stopPolling();
    await doDispenseAll();  // Start dispensing
  }
  if (state.pay.in_progress === false && !state.pay.approved) {
    // Payment failed
    setPayStatus("error");
    setPayMessage(`Error: ${state.pay.last_error}`);
  }
}, 500);
```

### 6. Dispense Loop

Once approved, React calls `dispense_item(success=true)` for each item in the basket:

```
POST http://127.0.0.1:8080/api/basket/dispense
Authorization: Bearer supersecret
Body: {
  "slot": 1,
  "success": true
}
```

Flask response:
```javascript
{
  "ok": true,
  "done": false,           // More items pending
  "remaining": 2
}
```

For each item, Flask:
1. Pops one item from the pending basket
2. Sends `CSLS1VNDSUCC(item_number, price, remaining_items, 0)` to card reader
3. Returns the updated basket state

React loops until `done: true`:

```javascript
let more = true;
while (more) {
  const res = await invoke("dispense_item", { slot: 1, success: true });
  more = !res.done;
  if (!res.done) {
    setPayMessage(`Dispensing... ${res.remaining} items remaining`);
  }
}
```

### 7. Payment Complete

- `payStatus = "done"`
- `payMessage = "Payment complete! Thank you."`
- Cart clears after 3 seconds
- System resets to idle

---

## Payment Flow: Customer Perspective

### Before Payment

1. Customer browses the vending machine screen
2. Taps on products they want (e.g., Cola, Chips, etc.)
3. Each tap adds one item; they can add multiple of the same product
4. Sees their selections and total price on screen

### At Checkout

1. Customer taps the "Checkout" button
2. Screen shows: "Initiating payment..."
3. Within 1-2 seconds, screen changes to: "Tap your contactless card to pay"

### Payment Approval

1. Customer taps their contactless card (credit card, debit card, or mobile wallet) on the card reader
2. System processes the transaction with the card reader
3. Screen updates: "Processing..." or shows a small status update

### Dispensing

1. Once payment is approved, the machine automatically dispenses items
2. Customer sees: "Dispensing your items..." with a counter (e.g., "2 items remaining")
3. Physical dispensing mechanisms activate—items drop into the collection area

### Completion

1. Screen shows: "Payment complete! Thank you."
2. After 3 seconds, screen returns to the main product selection view
3. Customer collects their items from the dispenser

### If Payment Fails

1. Card declined or reader error detected
2. Screen shows: "Payment failed: [reason]"
3. Customer can tap "Dismiss" or "Cancel"
4. No items are dispensed
5. System returns to product selection

---

## Setup & Running

### Prerequisites

- Python 3.8+
- Node.js 16+
- Rust (for Tauri)
- Serial port connection to MDB card reader (typically `/dev/ttyUSB0`)

### Backend Setup

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install flask pyserial
```

### Start Flask Server

```bash
# With default settings (serial on /dev/ttyUSB0, Flask on port 8080)
python app_vend.py

# Or with custom settings
export MDB_PORT=/dev/ttyUSB0
export WEB_PORT=8080
export API_TOKEN=your_secret_token
python app_vend.py
```

Expected output:
```
[app_vend] Starting on http://0.0.0.0:8080
[app_vend] Serial : /dev/ttyUSB0 @ 115200 baud
[app_vend] Token  : API_TOKEN env var (currently set)
[app_vend] Basket mode: 0
```

### Frontend Setup & Run

```bash
# Install dependencies
npm install

# Development mode (Vite + Tauri)
npm run tauri dev

# Build production bundle
npm run tauri build
```

---

## Configuration

Set these environment variables before running `app_vend.py`:

| Variable | Default | Description |
|----------|---------|-------------|
| `MDB_PORT` | `/dev/ttyUSB0` | Serial port for card reader |
| `MDB_BAUD` | `115200` | Baud rate for serial communication |
| `WEB_HOST` | `0.0.0.0` | Flask server bind address |
| `WEB_PORT` | `8080` | Flask server port |
| `API_TOKEN` | `supersecret` | Authorization token (Tauri must match this) |
| `CASHLESS_X` | `1` | Cashless device index (typically 1) |
| `BASKET_MODE` | `0` | Basket mode: 0 = single item, 1 = multiple items |
| `CARD_TAP_TIMEOUT_S` | `60.0` | Timeout for customer card tap |
| `VNDAPP_TIMEOUT_S` | `30.0` | Timeout for VNDAPP response from card reader |

---

## API Endpoints (Flask)

### POST /api/basket/pay

Initiates a payment flow.

**Request:**
```json
{
  "slot": 1,
  "items": [
    {"id": 1, "name": "Cola", "price": 150, "qty": 1}
  ]
}
```

**Response:**
```json
{
  "ok": true
}
```

### POST /api/basket/dispense

Reports one item as dispensed. Must be called once per item after payment approval.

**Request:**
```json
{
  "slot": 1,
  "success": true
}
```

**Response:**
```json
{
  "ok": true,
  "done": false,
  "remaining": 2
}
```

### GET /api/state

Polls the current payment state.

**Response:**
```json
{
  "pay": {
    "in_progress": true,
    "approved": false,
    "last_status": "Waiting for card tap...",
    "last_error": "",
    "pending_items": [
      {"id": 1, "name": "Cola", "price": 150}
    ]
  },
  "connected": true,
  "cashless": { ... }
}
```

---

## State Flow Diagram

```
        User Selects Items
                |
                v
        [IDLE] - Click Checkout
                |
                v
        [PAYING] - Tauri calls /api/basket/pay
                |  Flask spawns _pay_flow thread
                |  React polls /api/state every 500ms
                |
        Does card approval arrive?
                |
        --------|--------
        |               |
        NO              YES
        |               |
        v               v
    [ERROR]        [DISPENSING] - Loop: call /api/basket/dispense
        |               |           until done=true
        |               |           Each call sends VNDSUCC
        |               |
        |               v
        |           [DONE] - Show success message
        |               |
        |               v
        |           Clear cart (3s delay)
        |               |
        +--->[IDLE] Reset state
```

---

## MDB Protocol Commands Used

The Flask server communicates with the card reader using MDB (Multi-Drop Bus) protocol:

| Command | Purpose |
|---------|---------|
| `CSLS1RESET` | Reset the cashless device |
| `CSLS1READY` | Device acknowledges reset (unsolicited response) |
| `CSLS1ENABLE` | Enable the device for transactions |
| `CSLS1VNDREQ(price,items)` | Request payment for items |
| `CSLS1VNDAPP(...)` | Card approved (unsolicited response) |
| `CSLS1VNDDEN` | Card denied (unsolicited response) |
| `CSLS1VNDSUCC(item,price,remaining,0)` | Item dispensed successfully |
| `CSLS1VNDFAIL` | Item dispense failed |
| `CSLS1ENDSESSION` | End payment session |

---

## Troubleshooting

### Flask Cannot Connect to Serial Port

```
Error: [Errno 2] No such file or directory: '/dev/ttyUSB0'
```

**Solution:**
- Check if USB cable is connected to card reader
- Verify port name: `ls /dev/tty*`
- Update `MDB_PORT` environment variable
- May need `sudo` permissions depending on OS

### Tauri Cannot Reach Flask

```
Payment request failed — is app_vend.py running on :8080?
```

**Solution:**
- Ensure Flask is running: `python app_vend.py`
- Check port 8080 is available: `lsof -i :8080`
- Verify network: Flask should be on `127.0.0.1:8080`

### Card Reader Not Responding

```
last_error: "VNDAPP timeout after 30.0s"
```

**Solution:**
- Check card reader is powered on
- Verify MDB cable connection
- Try different `VNDAPP_TIMEOUT_S` value
- Check card reader is in contactless mode

### Payment Approved But Items Not Dispensing

Ensure you're calling `POST /api/basket/dispense` after approval.

**Solution:**
- Check React console for errors
- Verify the loop in `doDispenseAll()` is running
- Ensure basket has items: check `/api/state` response

---

## Development Notes

- **Price Format:** Prices are stored as scaled integers throughout the system. React converts decimal (£1.25) → integer (125) before sending to Flask.
- **Async Flow:** Payment approval is asynchronous—Flask thread runs in background while React polls for completion.
- **Error Recovery:** If payment fails at any stage, the basket is cleared and system returns to idle.
- **Token Security:** In production, change `API_TOKEN` from default "supersecret" to a strong secret.



sudo apt install build-essential pkg-config \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libglib2.0-dev \
  libgdk-pixbuf-2.0-dev \
  libcairo2-dev \
  libpango1.0-dev \
  libatk1.0-dev \
  libx11-dev

deb http://deb.debian.org/debian trixie main contrib non-free non-free-firmware
deb http://deb.debian.org/debian-security trixie-security main contrib non-free non-free-firmware
deb http://deb.debian.org/debian trixie-updates main contrib non-free non-free-firmware