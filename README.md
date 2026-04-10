# Coinadrink Ordering System

A contactless card and NFC balance payment system for PicoVend EZ Bridge vending machines. Built with React (frontend), Tauri (desktop bridge), and Flask (payment logic and hardware communication). Features Raspberry Pi GPIO-based PIR motion sensing for screen-saver wake/inactivity, an MFRC522 NFC reader for admin authentication and user balance payments, and a full-screen screen saver that activates after a configurable inactivity timeout.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Directory Structure](#directory-structure)
3. [Component Breakdown](#component-breakdown)
   - [Frontend (React)](#frontend-react)
   - [Tauri Bridge (Rust)](#tauri-bridge-rust)
   - [Axum Product Editor Server (Rust)](#axum-product-editor-server-rust)
   - [Flask Payment Server (Python)](#flask-payment-server-python)
   - [SQLite Databases](#sqlite-databases)
4. [Data Flow](#data-flow)
   - [Application Startup](#application-startup)
   - [Product Selection](#product-selection)
   - [Payment Flow (Technical)](#payment-flow-technical)
   - [NFC Payment Flow](#nfc-payment-flow)
   - [Payment Flow (Customer Perspective)](#payment-flow-customer-perspective)
   - [Product Management (Admin)](#product-management-admin)
5. [State Flow Diagram](#state-flow-diagram)
6. [MDB Protocol Commands](#mdb-protocol-commands)
7. [API Reference](#api-reference)
   - [Flask Endpoints](#flask-endpoints)
   - [Axum Product Editor Endpoints](#axum-product-editor-endpoints)
   - [Tauri Commands](#tauri-commands)
8. [Database Schema](#database-schema)
9. [Configuration](#configuration)
10. [Build Instructions](#build-instructions)
    - [Prerequisites](#prerequisites)
    - [Backend Setup (Flask)](#backend-setup-flask)
    - [Frontend and Tauri Setup](#frontend-and-tauri-setup)
    - [Cross-Compilation for Raspberry Pi](#cross-compilation-for-raspberry-pi)
11. [Troubleshooting](#troubleshooting)
12. [Development Notes](#development-notes)
13. [Testing](#testing)
14. [Over-the-Air Updates](#over-the-air-updates)
    - [How It Works](#how-it-works)
    - [Signing Format](#signing-format)
    - [Key Files](#key-files)
    - [Build Requirements — Dedicated Build Pi](#build-requirements--dedicated-build-pi)
    - [Release Process (Step by Step)](#release-process-step-by-step)
    - [Generating the Keypair (First Time Only)](#generating-the-keypair-first-time-only)
    - [Troubleshooting Updates](#troubleshooting-updates)

---

## System Architecture

The system is composed of four layers that communicate over HTTP and serial:

```
+-------------------------------------------+
|          React App (Frontend)             |
|  src/App.jsx, src/Components/*            |
|  Product selection, cart, payment status   |
+-------------------------------------------+
          |                         ^
          | invoke() commands       | return values
          v                         |
+-------------------------------------------+
|        Tauri Bridge (lib.rs)              |
|  src-tauri/src/lib.rs                     |
|  HTTP client to Flask, DB access,         |
|  spawns Flask + Axum servers              |
+-------------------------------------------+
    |              |              |
    | HTTP         | HTTP         | Direct fn call
    | POST/GET     | POST/GET     |
    v              v              v
+----------------+ +------------+ +-------------------+
| Flask Server   | | Axum       | | SQLite Databases  |
| app_vend.py    | | server.rs  | | database.rs       |
| Payment logic, | | Product    | | products.db       |
| serial comms   | | editor API | | ordering_system_  |
| port 8080      | | + static   | |   data.db         |
|                | | HTML page  | |                   |
|                | | port 3000  | |                   |
+----------------+ +------------+ +-------------------+
    |
    | Serial (MDB Protocol)
    v
+-------------------------------------------+
|   Card Reader Hardware                    |
|   PicoVend EZ Bridge                     |
+-------------------------------------------+
```

### Layer Responsibilities

| Layer | Files | Responsibility |
|-------|-------|----------------|
| React Frontend | `src/App.tsx`, `src/AppHelpers.tsx`, `src/AppVisualHelpers.tsx`, `src/hardwareHelpers.tsx`, `src/Components/*` | Product browsing, cart management, payment status display, admin panel, screen saver, NFC notifications |
| Tauri Bridge | `src-tauri/src/lib.rs` | Exposes Rust functions as commands callable from React via `invoke()`. Manages HTTP calls to Flask, direct SQLite access, process lifecycle for Flask and Axum servers |
| Axum Server | `src-tauri/src/server.rs` | Standalone HTTP server on port 3000 serving a static HTML product editor page and REST API for CRUD operations on the products database |
| Flask Server | `app_vend.py` | Payment orchestration, serial communication with the MDB card reader, basket state tracking, dispense acknowledgment |
| Database Layer | `src-tauri/src/database.rs`, `src-tauri/src/users_database.rs` | All SQLite read/write operations for products, orders, and users (NFC tag IDs and balances) |
| Motion Sensor | `src-tauri/src/motion_sensor.rs` | Listens on GPIO pin 7 (BCM) for PIR sensor output. Emits `motion-detected` Tauri event to wake the screen saver |
| NFC Reader | `src-tauri/src/nfc.rs` | Reads MFRC522 tags over SPI. Emits `nfc-admin-found` for allowlisted tags or `nfc-unknown-tag` for other tags |

---

## Directory Structure

```
ordering_system/
|
|-- app_vend.py                  Flask payment server (Python)
|-- app_vend_requirements.txt    Python dependencies for Flask server
|-- package.json                 Node.js project config (Vite + React)
|-- vite.config.js               Vite bundler configuration
|-- index.html                   Vite entry HTML (loads React app)
|-- README.md                    This file
|-- test_sensor.py               Standalone Raspberry Pi PIR sensor test script
|
|-- src/                         React frontend source
|   |-- main.tsx                 React entry point, renders App inside MantineProvider
|   |-- App.tsx                  Main application component (state, logic, layout)
|   |-- AppHelpers.tsx           Pure helper functions (price, filter, icons)
|   |-- AppVisualHelpers.tsx     All rendered sub-sections and modal components
|   |-- hardwareHelpers.tsx      Hardware abstraction (door, lights, NFC, motion)
|   |-- imageImporter.tsx        Static image map for screen saver slides
|   |-- Components/
|   |   |-- Button.tsx           PrimaryButton and RemoveButton components
|   |   |-- CategoryIndicator.tsx Category tab bar with floating indicator
|   |   |-- Modal.tsx            Generic modal overlay component
|   |   |-- PriceStatusPill.tsx  Fixed bottom bar with cart view and checkout buttons
|   |   |-- ProductCard.tsx      Individual product display card
|   |   |-- QuantityBadge.tsx    Badge overlay showing count in the cart
|   |   |-- ScreenSaver.tsx      Full-screen image slideshow screen saver
|   |-- test/
|       |-- setup.js             Vitest global test setup
|       |-- AppHelpers.test.spec.tsx
|       |-- Button.test.spec.tsx
|       |-- CategoryIndicator.test.spec.tsx
|       |-- hardwareHelpers.test.spec.tsx
|       |-- Modal.test.spec.tsx
|       |-- PriceStatusPill.test.spec.tsx
|       |-- ProductCard.test.spec.tsx
|       |-- QuantityBadge.test.spec.tsx
|       |-- ScreenSaver.test.spec.tsx
|
|-- src-tauri/                   Tauri (Rust) backend
|   |-- Cargo.toml               Rust dependencies
|   |-- tauri.conf.json          Tauri application configuration
|   |-- build.rs                 Tauri build script
|   |-- capabilities/
|   |   |-- default.json         Tauri permissions (window fullscreen, opener, core)
|   |-- src/
|       |-- main.rs              Rust entry point, calls lib::run()
|       |-- lib.rs               Tauri command definitions, server process management
|       |-- database.rs          SQLite operations (products + orders)
|       |-- users_database.rs    SQLite operations (users + NFC balances)
|       |-- server.rs            Axum HTTP server for product editor (port 3000)
|       |-- motion_sensor.rs     Raspberry Pi PIR sensor listener (GPIO, emits events)
|       |-- nfc.rs               MFRC522 NFC reader listener (SPI, emits events)
|       |-- static/
|           |-- index.html       Product editor admin page (served by Axum)
|
|-- public/                      Vite static assets
```

---

## Component Breakdown

### Frontend (React)

#### Entry Point: `src/main.jsx`

Mounts the React application inside a MantineProvider (UI component library) and renders the `App` component into the DOM element with id `root`.

#### Main Component: `src/App.tsx`

This is the central component managing all application state and orchestrating user interactions. It contains no routing; the entire application is a single view with modal overlays.

**Constants:**

| Constant | Value | Description |
|----------|-------|-------------|
| `INITIAL_STATE_FULLSCREEN` | `true` | Whether the app starts in fullscreen mode |
| `SCREENSAVER_TIMEOUT_MINUTES` | `1` | Minutes of inactivity before the screen saver activates |
| `FETCH_PRODUCTS_INTERVAL` | `6000` | Product poll interval in milliseconds |
| `NFC_ONLY_MODE` | `false` | Set to `true` to disable the corner double-click admin trigger and require NFC for admin access |

**State variables:**

| Variable | Type | Purpose |
|----------|------|---------|
| `modalOpen` | boolean | Controls visibility of the selected products (cart) modal |
| `screenSaverActive` | boolean | Whether the full-screen screen saver is currently showing |
| `checkoutActive` | boolean | Controls visibility of the payment modal |
| `adminModalOpen` | boolean | Controls visibility of the admin panel modal |
| `paymentMethodModalOpen` | boolean | Controls visibility of the payment method selection modal |
| `fullScreenState` | boolean | Tracks whether the window is in fullscreen mode |
| `activeCategory` | string | Currently selected product category filter |
| `selectedProducts` | array | Products added to the cart, each with a `count` field |
| `products` | array | All products fetched from the database |
| `payStatus` | string | Current payment state: `"idle"`, `"paying"`, `"nfc"`, `"dispensing"`, `"done"`, `"waiting_door"`, or `"error"` |
| `payMessage` | string | Human-readable payment status message displayed in the checkout modal |
| `editorUrl` | string | URL of the Axum product editor server (displayed in admin panel) |
| `nfcNotification` | string \| null | Short-lived notification message for NFC tag scan results |
| `paymentMethod` | `"card"` \| `"nfc"` \| null | Which payment method the user selected in the payment method modal |

**Refs:**

| Ref | Purpose |
|-----|---------|
| `pollRef` | Holds the interval ID for payment state polling or product refresh polling |
| `cancelledRef` | Boolean flag to signal cancellation of an in-progress payment flow |
| `unlistenMotionRef` | Unsubscribe function for the `motion-detected` Tauri event listener |
| `unlistenNfcAdminRef` | Unsubscribe function for the `nfc-admin-found` Tauri event listener |
| `unlistenNfcUnknownRef` | Unsubscribe function for the `nfc-unknown-tag` Tauri event listener |
| `nfcNotificationTimerRef` | Timeout ID for auto-clearing the NFC notification after 5 seconds |
| `inactivityTimerRef` | Timeout ID for the screen saver inactivity countdown |

**Key functions:**

| Function | Description |
|----------|-------------|
| `fetchProducts` | Sets up a 6-second polling interval that calls the `query_products` Tauri command to refresh the product list from the database |
| `stopPolling` | Clears the active polling interval |
| `clearInactivityTimer` | Clears the inactivity timeout preventing the screen saver from activating |
| `startInactivityTimer` | Starts (or restarts) the countdown to activate the screen saver. No-ops while checkout is active |
| `resetInactivityTimer` | Dismisses the screen saver if visible and restarts the inactivity countdown |
| `listenToMotionSensor` | Registers the `motion-detected` Tauri event listener. Calls `resetInactivityTimer` on each event |
| `listenToNfc` | Registers `nfc-admin-found` (opens admin modal) and `nfc-unknown-tag` (shows notification) Tauri event listeners |
| `showNfcNotification(message)` | Sets the NFC notification text and auto-clears it after 5 seconds |
| `handleNFCCheckout` | Initiates NFC balance payment: calls `listenToNFCPayment`, unlocks door after approval, polls door closure, shows remaining balance on completion |
| `handleCardCheckout` | Initiates card payment: sets paying state, converts prices to pence, calls Flask via `initiate_payment`, starts 500ms state polling |
| `doDispenseAll` | After card payment approval, loops calling `dispense_item` for each basket item until all are dispensed. Saves each as an order |
| `startPolling` | Begins 500ms polling of `get_pay_state` to monitor card payment progress. On approval, triggers `doDispenseAll` |
| `appendProduct(product, action)` | Adds (`"+"`) or removes (`"-"`) a product from the cart. Increments/decrements count for existing items, adds new items with count 1, removes items when count reaches 0 |

**Layout structure:**

The component renders:
1. `ScreenSaver` -- Full-screen image slideshow overlay. Shown when `screenSaverActive` is true; dismissed on tap or motion
2. `NFCNotification` -- Temporary toast shown when an unknown NFC tag is scanned
3. `CategoryIndicatorComponent` -- Fixed top bar with category filter tabs
4. `ProductsSection` -- Grid of product cards filtered by active category and availability
5. `PriceStatusPillComponent` -- Fixed bottom bar with "View Cart" and "Checkout" buttons showing total price
6. `CheckoutModal` -- Payment progress modal with status icon, message, and action buttons
7. `SelectedProductsModal` -- Cart modal showing selected products with quantity and remove controls
8. `AdminModal` -- Admin panel modal (triggered by double-clicking a hidden corner div, or by an NFC admin tag) with fullscreen toggle, kill app, refresh products, and editor link
9. `PaymentMethodModal` -- Lets the user choose between card payment and NFC balance payment before proceeding to checkout

#### Helper Module: `src/AppHelpers.tsx`

Exports pure functions used throughout the application:

| Export | Type | Description |
|--------|------|-------------|
| `statusIcon(payStatus)` | function | Returns a React icon component based on the payment status string. `"paying"` → credit card icon, `"nfc"` → NFC icon, `"dispensing"` → settings/gear icon, `"done"` → green checkmark, `"waiting_door"` → door icon, `"error"` → red cross, `"idle"` → null |
| `totalPrice(selectedProducts)` | function | Reduces the selected products array to a total price by summing `product_price * count` for each item |
| `filteredProducts(products, activeCategory)` | function | Filters the product array by category and availability |
| `getProductIcon(productName, productCategory, size)` | function | Returns a themed icon component for a product based on keyword matching on the name and category (bread, bottle, candy, cookie, shopping bag) |

#### Visual Module: `src/AppVisualHelpers.tsx`

Exports all rendered sub-sections and modal components used by `App.tsx`. This separates layout from logic. The `CATEGORIES` constant is also defined here.

| Export | Description |
|--------|-------------|
| `SelectedProductsModal` | Cart modal listing selected items with quantity badges and remove buttons |
| `CheckoutModal` | Payment status modal displaying the status icon, message, cancel, and dismiss controls. Behaviour differs between card and NFC payment types |
| `PriceStatusPillComponent` | Wrapper for `PriceStatusPill`, passes through modal open and checkout callbacks |
| `AdminModal` | Admin panel with fullscreen toggle, editor URL link, kill-app button, and product refresh |
| `CategoryIndicatorComponent` | Wraps `CategoryIndicator` with the full categories list |
| `ProductsSection` | Renders the filtered product grid using `ProductCard` components |
| `PaymentMethodModal` | Payment method selector modal offering "Card" and "NFC" options |
| `NFCNotification` | Small notification element showing the last NFC scan result |
| `styles` | Shared style object used across visual sub-components |

#### Hardware Module: `src/hardwareHelpers.tsx`

Provides hardware abstraction functions that wrap Tauri `invoke` calls and Tauri event listeners. All environment-specific concerns (door lock, lights, NFC, motion) are isolated here.

| Export | Description |
|--------|-------------|
| `unlockDoor()` | POSTs to `$VITE_DOOR_API_URL/open` to release the door lock |
| `isDoorClosed()` | Invokes `get_door_status` and returns `true` if `lock_state === "closed"` |
| `setLightsColor(color)` | POSTs to the Shelly cloud API to set the RGB light to `"green"`, `"red"`, or `"blue"` at full brightness |
| `listenToMotionSensor(onMotion)` | Subscribes to the `motion-detected` Tauri event. Returns the unsubscribe function |
| `listenToNfcAdminFound(onAdminFound)` | Subscribes to the `nfc-admin-found` Tauri event. Returns the unsubscribe function |
| `listenToNfcUnknownTag(onUnknown)` | Subscribes to the `nfc-unknown-tag` Tauri event, passing the tag UID string to the callback. Returns the unsubscribe function |
| `listenToNFCPayment(amount, onSuccess, onError)` | Invokes `get_tag_id` to read the user's NFC tag, checks their balance, deducts the amount via `update_balance_by_tag_id`, and calls `onSuccess(newBalance)` or `onError(err)` |
| `listenToNFCTags()` | Low-level helper that loops on `get_tag_id` until a tag UID is returned |

**Environment variables used by `hardwareHelpers.tsx`:**

| Variable | Purpose |
|----------|---------|
| `VITE_DOOR_API_URL` | Base URL of the door lock API |
| `VITE_LIGHT_AUTHENTICATION_KEY` | Shelly cloud auth key |
| `VITE_LIGHT_ID` | Shelly device ID |

#### Components

**`src/Components/Button.tsx`**

Exports two components:
- `PrimaryButton` -- A Mantine `Button` with a filled variant, extra-large size, rounded corners, and hover effects. Accepts `title`, `onClick`, `color`, and `onDoubleClick` props.
- `RemoveButton` -- A Mantine outline `Button` styled as a small circular button displaying a cross icon. Used on product cards in the cart to decrement/remove items.

**`src/Components/CategoryIndicator.tsx`**

Renders a horizontal scrollable row of `PrimaryButton` components, one per category. The active category button is colored blue (`#3e73ef`), others are gray. Includes a Mantine `FloatingIndicator` at the bottom of the active tab.

**`src/Components/Modal.tsx`**

A generic modal overlay component. When `opened` is true, renders a fixed full-viewport dark overlay. Clicking the overlay calls `closed`. The inner content area stops click propagation. Accepts `title`, `children`, and optional `innerStyle` for width overrides.

**`src/Components/PriceStatusPill.tsx`**

A fixed bottom bar containing two buttons: "View Cart" (calls `onModalOpen`) and "Checkout" (calls `onCheckout`). The checkout button displays the total price in GBP.

**`src/Components/ProductCard.tsx`**

Renders an individual product as a rounded card. Displays the product name (truncated to 20 characters if longer) and price in GBP. Shows a `QuantityBadge` when the item is in the cart. When `selected` and `showRemoveButton` are both true, a `RemoveButton` is rendered.

**`src/Components/QuantityBadge.tsx`**

A small circular badge overlaid on a product card showing how many of that item are in the cart. Renders nothing when `count` is zero or undefined. Accepts a custom `color` prop (default red `#e53935`).

**`src/Components/ScreenSaver.tsx`**

A full-screen image slideshow overlay with a configurable `INTERVAL` (default 8 seconds). Accepts an optional `images` array; falls back to the images imported from `imageImporter.tsx`. Tapping anywhere dismisses the screen saver and calls `onClose`. The slide timer is cleared on unmount to prevent memory leaks.

---

### Tauri Bridge (Rust)

#### Entry Point: `src-tauri/src/main.rs`

Suppresses the Windows console window in release builds and calls `ordering_system_lib::run()`.

#### Command Definitions: `src-tauri/src/lib.rs`

This file defines all Tauri commands that the React frontend can call via `invoke()`. It also manages server process lifecycle.

**Constants:**

| Constant | Value | Purpose |
|----------|-------|---------|
| `FLASK_BASE` | `"http://127.0.0.1:8080"` | Base URL for the Flask payment server |
| `API_TOKEN` | `"supersecret"` | Bearer token sent to Flask for authentication |

**Globals:**

| Global | Type | Purpose |
|--------|------|---------|
| `SERVER_PROCESS` | `Mutex<Option<Child>>` | Holds the child process handle for the Axum server so it can be killed on shutdown |

**Helper functions:**

| Function | Description |
|----------|-------------|
| `make_client()` | Builds a `reqwest::Client` for HTTP requests |
| `auth_header()` | Returns the authorization header string `"Bearer supersecret"` |

**Registered Tauri commands** (in order of registration in `generate_handler!`):

| Command | Parameters | Return | Description |
|---------|-----------|--------|-------------|
| `dispense_item` | `slot: u32, success: bool` | `Result<String, String>` | POSTs to Flask `/api/basket/dispense` to report one item dispensed |
| `initiate_payment` | `slot: u32, items: Vec<BasketItem>` | `Result<String, String>` | POSTs to Flask `/api/basket/pay` with basket items to start payment |
| `get_pay_state` | none | `Result<String, String>` | GETs Flask `/api/state` to poll payment progress |
| `initialize_payment_server` | none | `Result<(), String>` | Spawns `app_vend.py` as a child process using Python, waits 2 seconds for startup |
| `initialize_orders_database` | none | `Result<(), String>` | Creates the orders database and table if they do not exist |
| `initialize_products_database` | none | `Result<(), String>` | Creates the products database and table if they do not exist |
| `insert_order` | `product_id: i32, quantity: i32, price: f64` | `Result<(), String>` | Inserts an order record into the orders database |
| `query_products` | none | `Result<Vec<Product>, String>` | Returns all products from the products database |
| `delete_product` | `product_id: i32` | `Result<(), String>` | Deletes a product by ID from the products database |
| `new_product` | `product_name, product_category, product_price, product_availability` | `Result<(), String>` | Inserts a new product into the products database |
| `kill_app` | none | `Result<(), String>` | Kills the Axum server child process (if running) and exits the application with `std::process::exit(0)` |
| `initialize_static_page_server` | none | `Result<(), String>` | Spawns `cargo run --bin server` as a child process to start the Axum product editor server. Kills any previously running instance first |
| `return_editor_url` | none | `String` | Returns the Axum server URL by calling `server::return_editor_url()` |
| `initialize_user_database` | none | `Result<(), String>` | Creates the users database and table if they do not exist |
| `get_balance_by_tag_id` | `tag_id: String` | `Result<Option<f64>, String>` | Returns the balance of the user with the given NFC tag UID, or `None` if not found |
| `update_balance_by_tag_id` | `tag_id: String, amount: f64` | `Result<f64, String>` | Deducts `amount` from the user's balance and returns the new balance. Errors if the balance would go negative |
| `get_tag_id` | none | `Result<String, String>` | Blocks until an NFC tag is read, then returns the tag UID as a hex string |

**BasketItem struct:**

```rust
struct BasketItem {
    id: u32,
    name: String,
    price: u32,     // Price in pence (integer)
    qty: u32,
}
```

**Shutdown behavior:**

When the Tauri `RunEvent::Exit` event fires, the application kills the Axum server child process if it is still running.

---

#### Motion Sensor: `src-tauri/src/motion_sensor.rs`

Spawns a background thread that polls a Raspberry Pi GPIO pin connected to a PIR sensor. When motion is detected (pin goes high), it emits a `motion-detected` Tauri event to the frontend.

**Constants:**

| Constant | Value | Description |
|----------|-------|-------------|
| `GPIO_PIN` | `7` | BCM-numbered GPIO pin for the PIR sensor output |

**Behaviour:**
- Runs on all platforms but requires `rppal` GPIO access; returns immediately with an error log if GPIO cannot be initialised (e.g. on non-Pi hardware)
- Waits 2 seconds after initialisation before polling to let the PIR sensor warm up
- Polls every 50 ms and only emits an event on the rising edge (low → high transition) to avoid repeated events during sustained motion

#### NFC Reader: `src-tauri/src/nfc.rs`

Manages the MFRC522 NFC reader connected via SPI at `/dev/spidev0.0`. Provides two public functions:

**Constants:**

| Constant | Value | Description |
|----------|-------|-------------|
| `GPIO_PIN` | `8` | GPIO pin for the NFC reader |

**`start_nfc_listener(app_handle)`** -- Spawns a background thread (Linux only) that continuously scans for NFC tags. On each scan:
- If the tag UID is found in the admin allow-list in `users_database`, emits `nfc-admin-found`
- Otherwise emits `nfc-unknown-tag` with the tag UID as the payload

**`listen_for_tag_ids()`** -- Blocking function that loops until a tag is detected and returns the UID as a hex string. Used by the `get_tag_id` Tauri command for NFC payment flows.

**Constants:**

| Constant | Value | Description |
|----------|-------|-------------|
| `SCAN_DELAY_MS` | `500` | Delay between scan attempts in milliseconds |
| `DEBOUNCE_MS` | `1500` | Minimum time between successive events for the same tag |

Both functions are no-ops on non-Linux platforms (logs a message and returns).

#### Users Database: `src-tauri/src/users_database.rs`

Manages the `ordering_system_users.db` SQLite database stored in `~/data/`. Stores NFC tag IDs, user names, admin status, and balance.

**User struct:**

```rust
pub struct User {
    pub user_id: u16,
    pub tag_id: String,    // lowercase hex UID, e.g. "a1b2c3d4"
    pub full_name: String,
    pub is_admin: bool,
    pub balance: f64,      // GBP balance for NFC payments
}
```

**Public functions:**

| Function | Description |
|----------|-------------|
| `initialize_user_database()` | Creates the users table if it does not exist |
| `new_user(tag_id, full_name, is_admin, balance)` | Inserts a new user |
| `search_users_by_name(name)` | Returns users whose `full_name` contains the search string (case-insensitive LIKE match) |
| `get_user_by_tag_id(tag_id)` | Returns the user with the exact tag UID, or `None` |
| `get_balance_by_tag_id(tag_id)` | Returns just the balance for a tag UID, or `None` |
| `get_all_admins()` | Returns all users with `is_admin = 1` |
| `update_balance_by_tag_id(tag_id, amount)` | Atomically deducts `amount` from the balance. Returns the new balance, or an error string if insufficient funds or tag not found |
| `update_user_by_tag_id(tag_id, full_name, is_admin, balance)` | Updates all fields for a user |
| `delete_user_by_tag_id(tag_id)` | Deletes a user by tag UID |

Tag IDs are stored and compared in lowercase (`lower(?1)`) to normalise across reader output formats.

### Admin Tag Setup

If the system has no admin user yet, create one with `create_admin.py` after first scanning the NFC tag to get its UID from the application.

The script is now standalone and can be copied to a new device on its own. On first run, it also installs a desktop launcher at `~/Desktop/Ordering System Admin Creator.desktop`.

Steps:
1. Scan the unidentified NFC tag with the running system and note the `tag_id` shown in the red notification.
2. Place `create_admin.py` in the desired local folder on the new system.
3. Run:
   ```bash
   python3 create_admin.py # only fir the first time setting up the user's device - then they desktop app is built automatically
   ```
4. Enter the scanned `tag_id` and the admin full name when prompted.

When the script runs, it will:
- create `~/data/ordering_system_users.db` if missing
- create the desktop shortcut on the current machine
- use a local `tag_listener` binary if present next to the script
- otherwise fallback to `cargo run --manifest-path ...` only when Rust/Cargo is installed

If you later move `create_admin.py` to another folder or device, rerun it so the desktop shortcut is recreated with the new path.

This adds the tag as an admin user in `~/data/ordering_system_users.db` so that future scans are recognised as admin access.

---

### Axum Product Editor Server (Rust)

#### File: `src-tauri/src/server.rs`

A standalone Axum HTTP server that runs on port 3000. It serves two purposes:
1. Hosts a static HTML page for product administration
2. Provides a REST API for product CRUD operations

The server is compiled as a separate binary target (`server`) and spawned as a child process by `lib.rs`.

**Server startup:**

The `main()` function builds an Axum router with:
- `GET /products` -- Returns all products as JSON
- `POST /products` -- Creates a new product
- `DELETE /products/:id` -- Deletes a product by ID
- `PUT /products/:id` -- Updates a product by ID
- Fallback: Serves static files from `src-tauri/src/static/` (the product editor HTML page)

The server binds to `0.0.0.0:3000` and prints the local network IP so other devices on the network can access the editor.

**`return_editor_url()`:**

Determines the machine's local IP address by creating a UDP socket, connecting to `8.8.8.8:80` (Google DNS, no actual data sent), and reading the local address. Returns `http://<local_ip>:3000`.

**Request/Response types:**

```rust
struct NewProduct {
    product_name: String,
    product_category: String,
    product_price: f64,
    product_availability: bool,
}
```

#### Static Admin Page: `src-tauri/src/static/index.html`

A self-contained HTML page with embedded CSS and JavaScript (no build step required). Provides a dark-themed product management interface.

**Features:**
- Displays all products in a table with ID, name, category, price, availability status (as colored pills), and action buttons
- Add product form with name, category dropdown, price input (with validation for positive decimal numbers with up to 2 decimal places), and availability checkbox
- Edit mode: clicking the edit button on a product row populates the form with that product's data and changes the form title to "Edit Product"
- Delete confirmation dialog before removing a product
- Status messages for success and error states

**JavaScript functions:**

| Function | Description |
|----------|-------------|
| `loadProducts()` | Fetches `GET /products` and stores the result, then calls `renderTable()` |
| `renderTable()` | Rebuilds the table body HTML from the products array |
| `esc(str)` | HTML-escapes ampersands, less-than, and greater-than characters |
| `validatePrice(val)` | Returns a parsed float if the value is a valid non-negative number with up to 2 decimal places, otherwise returns null |
| `setStatus(msg, ok)` | Updates the status text element with a message and applies green (ok) or red (error) styling |
| `startEdit(id)` | Finds the product by ID and populates the form fields for editing |
| `cancelEdit()` | Resets the form to its default "Add Product" state |
| `submitForm()` | Validates input, then either PUTs to `/products/:id` (edit) or POSTs to `/products` (create). Reloads the product list on success |
| `deleteProduct(id)` | Confirms deletion, then sends `DELETE /products/:id` and reloads |

---

### Flask Payment Server (Python)

#### File: `app_vend.py`

The Flask server handles all payment and hardware communication. It runs on port 8080 by default and communicates with a PicoVend EZ Bridge card reader over a serial connection using the MDB (Multi-Drop Bus) protocol.

**Core class: `MdbBridge`**

Manages the serial connection to the card reader and maintains the global application state. Runs a background thread that continuously reads serial data and parses MDB responses.

**State structure:**

```python
state = {
    "pay": {
        "in_progress": False,
        "approved": False,
        "last_status": "",
        "last_error": "",
        "pending_items": []
    },
    "connected": False,
    "cashless": {
        "last_vndapp": None,
        "last_vndden": None
    }
}
```

**Payment thread (`_pay_flow`):**

When `/api/basket/pay` is called, a background thread executes:

1. Reset state: clear previous payment data
2. Send `CSLS1RESET` to the card reader
3. Wait for `CSLS1READY` response (device acknowledged reset)
4. Send `CSLS1ENABLE` to activate the readers contactless interface
5. Send `CSLS1VNDREQ(total_price, item_count)` to request payment
6. Wait up to `VNDAPP_TIMEOUT_S` seconds for either:
   - `CSLS1VNDAPP(...)` -- card approved, set `approved = True`
   - `CSLS1VNDDEN` -- card declined, set error
7. If neither arrives within the timeout, set a timeout error

**Dispense flow:**

When `/api/basket/dispense` is called after approval:

1. Pop one item from `pending_items`
2. Send `CSLS1VNDSUCC(item_number, price, remaining_items, 0)` to the card reader
3. Return `{ "ok": true, "done": <bool>, "remaining": <int> }`
4. When the last item is dispensed (`done: true`), send `CSLS1ENDSESSION`

---

### SQLite Databases

#### File: `src-tauri/src/database.rs`

All database operations are implemented as synchronous functions using the `rusqlite` crate. The databases are stored in a `data` directory under the user's home directory (`USERPROFILE` on Windows, `HOME` on Linux/macOS, or the system temp directory as fallback).

**Database file locations:**

| File | Path | Purpose |
|------|------|---------|
| `products.db` | `~/data/products.db` | Product catalog |
| `ordering_system_data.db` | `~/data/ordering_system_data.db` | Order history |

**Public functions:**

| Function | Description |
|----------|-------------|
| `initialize_products_database()` | Creates the products table if it does not exist |
| `initialize_orders_database()` | Creates the orders table if it does not exist |
| `new_product(name, category, price, availability)` | Inserts a new product. Creates the database first if it does not exist |
| `delete_product(product_id)` | Deletes a product by ID. No-ops if the database does not exist |
| `update_product(product_id, name, category, price, availability)` | Updates all fields of an existing product. No-ops if the database does not exist |
| `insert_order(product_id, quantity, price)` | Inserts an order record with a timestamp. Creates the database first if it does not exist |
| `query_products()` | Returns all products as a `Vec<Product>`. Returns an empty vector if the database does not exist |

**Product struct:**

```rust
pub struct Product {
    pub product_id: i32,
    pub product_name: String,
    pub product_category: String,
    pub product_price: f64,
    pub product_availability: bool,
}
```

**Accessing databases manually:**

To inspect the products database from a terminal:
```
cd ~/data
sqlite3 products.db
SELECT * FROM products;
```

To inspect the orders database:
```
cd ~/data
sqlite3 ordering_system_data.db
SELECT * FROM orders;
```

All SQL commands must end with a semicolon.

---

## Data Flow

### Application Startup

The following sequence occurs when the Tauri application launches:

```
main.rs
  |
  v
lib.rs :: run()
  |
  +-- Tauri Builder initializes
  |     Registers all commands
  |     Sets up window
  |
  v
App.tsx :: useEffect (runs once on mount)
  |
  +-- listenToMotionSensor()            // registers motion-detected listener
  |     -> hardware.listenToMotionSensor()
  |     -> Calls resetInactivityTimer on each event
  |
  +-- listenToNfc()                     // registers NFC event listeners
  |     -> hardware.listenToNfcAdminFound() -> opens admin modal
  |     -> hardware.listenToNfcUnknownTag() -> shows NFC notification
  |
  +-- invoke("return_editor_url")
  |     -> server.rs :: return_editor_url()
  |     -> Returns "http://<local_ip>:3000"
  |     -> Stored in editorUrl state
  |
  +-- invoke("initialize_static_page_server")
  |     -> lib.rs :: initialize_static_page_server()
  |     -> Spawns: cargo run --bin server
  |     -> Axum server starts on port 3000
  |     -> Serves product editor HTML + REST API
  |
  +-- fetchProducts() (polled every 6 seconds)
  |     -> invoke("query_products")
  |     -> database.rs :: query_products()
  |     -> Returns Vec<Product> to React
  |     -> Stored in products state
  |
  +-- invoke("initialize_payment_server")
  |     -> lib.rs :: initialize_payment_server()
  |     -> Spawns: python app_vend.py
  |     -> Waits 2 seconds for Flask startup
  |     -> Flask server starts on port 8080
  |     -> MDB bridge connects to card reader serial port
  |
  +-- startInactivityTimer()            // starts screen saver countdown
  |     -> After SCREENSAVER_TIMEOUT_MINUTES, sets screenSaverActive = true
  |
  +-- window event listeners registered (pointerdown, keydown)
  |     -> each calls resetInactivityTimer()
  |
  +-- getCurrentWindow().setFullscreen(true)
        -> Window goes fullscreen after 1 second delay
```

### Product Selection

```
User taps a ProductCard
  |
  v
App.jsx :: appendProduct(product, "+")
  |
  +-- Checks if product already in selectedProducts
  |     YES: increment count by 1
  |     NO:  add product with count = 1
  |
  v
selectedProducts state updated
  |
  +-- PriceStatusPill re-renders with new totalPrice
  +-- Cart modal (if open) shows updated quantities
```

```
User taps RemoveButton on a selected product
  |
  v
App.jsx :: appendProduct(product, "-")
  |
  +-- Checks if product count > 1
  |     YES: decrement count by 1
  |     NO:  remove product from array entirely
  |
  v
selectedProducts state updated
```

### Payment Flow (Technical)

```
1. User clicks "Checkout" button in PriceStatusPill
   |
   v
2. App.jsx :: handleCheckout()
   |
   +-- Guard: if selectedProducts is empty, return
   +-- Set cancelledRef = false
   +-- Set checkoutActive = true (opens payment modal)
   +-- Set payStatus = "paying"
   +-- Set payMessage = "Initiating payment..."
   |
   +-- Convert products to basket items:
   |     For each selectedProduct:
   |       id: product_id
   |       name: product_name
   |       price: Math.round(product_price * 100)  // GBP to pence
   |       qty: count
   |
   +-- invoke("initiate_payment", { slot: 1, items })
   |     |
   |     v
   |   lib.rs :: initiate_payment()
   |     |
   |     +-- POST http://127.0.0.1:8080/api/basket/pay
   |     |   Authorization: Bearer supersecret
   |     |   Body: { "slot": 1, "items": [...] }
   |     |
   |     v
   |   app_vend.py :: /api/basket/pay handler
   |     |
   |     +-- Stores items in state.pay.pending_items
   |     +-- Spawns _pay_flow() thread
   |     +-- Returns { "ok": true } immediately
   |     |
   |     v
   |   _pay_flow() (background thread):
   |     +-- CSLS1RESET -> card reader
   |     +-- Wait for CSLS1READY
   |     +-- CSLS1ENABLE -> card reader
   |     +-- CSLS1VNDREQ(total_price, item_count) -> card reader
   |     +-- Wait for VNDAPP or VNDDEN (up to VNDAPP_TIMEOUT_S)
   |
   v
3. On successful initiation:
   +-- Set payMessage = "Tap your contactless card to pay..."
   +-- Start polling (startPolling)
   |
   v
4. App.jsx :: startPolling()
   |
   +-- Every 500ms:
   |     invoke("get_pay_state")
   |       |
   |       v
   |     lib.rs :: get_pay_state()
   |       |
   |       +-- GET http://127.0.0.1:8080/api/state
   |       +-- Returns full state JSON
   |       |
   |       v
   |     Check state.pay:
   |       |
   |       +-- If pay.approved == true:
   |       |     Stop polling
   |       |     Set payMessage = "Card approved!"
   |       |     Call doDispenseAll()
   |       |
   |       +-- If pay.in_progress == false AND pay.last_error exists:
   |       |     Stop polling
   |       |     Set payStatus = "error"
   |       |     Set payMessage = last_error
   |       |
   |       +-- Otherwise:
   |             Set payMessage = pay.last_status (e.g. "Waiting for card tap...")
   |
   v
5. App.jsx :: doDispenseAll() (after approval)
   |
   +-- Set payStatus = "dispensing"
   +-- Set payMessage = "Dispensing your items..."
   |
   +-- Loop while more items:
   |     invoke("dispense_item", { slot: 1, success: true })
   |       |
   |       v
   |     lib.rs :: dispense_item()
   |       |
   |       +-- POST http://127.0.0.1:8080/api/basket/dispense
   |       |   Body: { "slot": 1, "success": true }
   |       |
   |       v
   |     app_vend.py :: /api/basket/dispense handler
   |       |
   |       +-- Pop one item from pending_items
   |       +-- CSLS1VNDSUCC(item, price, remaining, 0) -> card reader
   |       +-- Return { "ok": true, "done": <bool>, "remaining": <int> }
   |       |
   |       v
   |     If done == false:
   |       Set payMessage = "Dispensing... N item(s) remaining"
   |       Continue loop
   |     If done == true:
   |       Exit loop
   |
   +-- Set payStatus = "done"
   +-- Set payMessage = "Payment complete! Thank you."
   |
   +-- For each selectedProduct:
   |     invoke("insert_order", { productId, quantity, price })
   |       -> database.rs :: insert_order()
   |       -> INSERT INTO orders (product_id, quantity, price) VALUES (...)
   |
   +-- After 3 seconds:
         Set checkoutActive = false
         Set payStatus = "idle"
         Set payMessage = ""
         Clear selectedProducts
```

### Payment Flow (Customer Perspective)

1. Customer browses products on the vending machine touchscreen
2. Taps product cards to add items to their selection
3. Each tap adds one unit; multiple taps add multiple units
4. The total price updates in real time on the bottom bar
5. Customer taps "Checkout" — a payment method modal appears
6. Customer selects **Card** or **NFC**

**Card path:**
7. Screen shows "Initiating payment..." for 1-2 seconds
8. Screen changes to "Tap your contactless card to pay"
9. Customer taps their contactless card, phone, or smartwatch on the card reader
10. If approved: screen shows "Card approved!" then "Dispensing your items..." with a countdown
11. The vending machine physically dispenses each item
12. Screen shows "Payment complete! Thank you." for 3 seconds
13. Screen returns to the product selection view

**NFC balance path:**
7. Screen shows "Please tap your NFC tag to pay…"
8. Customer taps their registered NFC tag
9. If sufficient balance: door unlocks and screen shows "Please take your items and close the door."
10. App polls the door status; once closed, screen shows "Payment successful. Remaining balance: £X.XX"
11. Screen returns to the product selection view after 5 seconds

**On failure (either method):** screen shows the error reason with a "Dismiss" button; door not unlocked.

### NFC Payment Flow

```
Customer selects NFC in PaymentMethodModal
  |
  v
App.tsx :: handleNFCCheckout()
  |
  +-- Set paymentMethod = "nfc"
  +-- Set payStatus = "paying"
  +-- Set payMessage = "Please tap your NFC tag to pay…"
  +-- Set checkoutActive = true
  |
  v
hardware.listenToNFCPayment(totalPrice, onSuccess, onError)
  |
  +-- invoke("get_tag_id")              // blocks until tag scanned
  |     -> lib.rs :: get_tag_id()
  |     -> nfc.rs :: listen_for_tag_ids()
  |     -> Returns tag UID hex string
  |
  +-- invoke("get_balance_by_tag_id", { tag_id })
  |     -> lib.rs :: get_balance_by_tag_id()
  |     -> users_database.rs :: get_balance_by_tag_id()
  |
  +-- Guard: if balance < totalPrice, call onError("Insufficient balance")
  |
  +-- invoke("update_balance_by_tag_id", { tag_id, amount: totalPrice })
  |     -> lib.rs :: update_balance_by_tag_id()
  |     -> users_database.rs :: update_balance_by_tag_id()
  |     -> Atomically deducts and returns new balance
  |
  +-- onSuccess(newBalance) called
        |
        v
App.tsx onSuccess handler
  |
  +-- Set payStatus = "dispensing"
  +-- hardware.unlockDoor()             // POST to door API
  +-- Set payStatus = "waiting_door"
  +-- Set payMessage = "Please take your items and close the door."
  |
  +-- Poll hardware.isDoorClosed() every 500ms
  |     -> invoke("get_door_status")
  |     -> Returns true when lock_state === "closed"
  |
  +-- On door closed:
        Set payStatus = "done"
        Set payMessage = "Payment successful.\nRemaining balance: £X.XX"
        Wait 5 seconds → resetCheckoutState()
```

### Product Management (Admin)

Products are managed through the Axum-hosted static HTML page, accessible from any device on the same network.

```
Admin opens http://<machine_ip>:3000 in a browser
  |
  v
index.html loads
  |
  +-- loadProducts()
  |     GET http://<machine_ip>:3000/products
  |       -> server.rs :: get_products()
  |       -> database.rs :: query_products()
  |       -> Returns JSON array of products
  |     Renders product table
  |
  v
Admin fills out the form and clicks "Save"
  |
  +-- submitForm()
  |     Validates price format
  |     If editing (edit-id is set):
  |       PUT /products/:id
  |         -> server.rs :: edit_product()
  |         -> database.rs :: update_product()
  |     If adding (edit-id is empty):
  |       POST /products
  |         -> server.rs :: create_product()
  |         -> database.rs :: new_product()
  |     Reloads product list
  |
  v
Admin clicks delete button on a product row
  |
  +-- deleteProduct(id)
        Confirmation dialog
        DELETE /products/:id
          -> server.rs :: remove_product()
          -> database.rs :: delete_product()
        Reloads product list
```

The React app picks up product changes automatically because it polls `query_products` every 6 seconds.

---

## State Flow Diagram

```
                    User Selects Items
                            |
                            v
                    +-------+-------+
                    |     IDLE      |
                    | payStatus =   |
                    | "idle"        |
                    +-------+-------+
                            |
                    Click "Checkout"
                            |
                            v
                    +-------+-------+
                    |    PAYING     |
                    | payStatus =   |
                    | "paying"      |
                    |               |
                    | Tauri calls   |
                    | /api/basket/  |
                    | pay           |
                    |               |
                    | React polls   |
                    | /api/state    |
                    | every 500ms   |
                    +-------+-------+
                            |
                Does card approval arrive?
                            |
                   +--------+--------+
                   |                 |
                   NO                YES
                   |                 |
                   v                 v
           +-------+------+  +------+--------+
           |    ERROR     |  |  DISPENSING    |
           | payStatus =  |  | payStatus =   |
           | "error"      |  | "dispensing"   |
           |              |  |               |
           | Shows error  |  | Loop: call    |
           | message and  |  | /api/basket/  |
           | "Dismiss"    |  | dispense      |
           | button       |  | until done=   |
           |              |  | true           |
           +-------+------+  |               |
                   |         | Each call      |
                   |         | sends VNDSUCC  |
                   |         | to card reader |
                   |         +------+---------+
                   |                |
                   |                v
                   |         +------+--------+
                   |         |     DONE      |
                   |         | payStatus =   |
                   |         | "done"        |
                   |         |               |
                   |         | "Payment      |
                   |         | complete!"    |
                   |         |               |
                   |         | Orders saved  |
                   |         | to database   |
                   |         +------+--------+
                   |                |
                   |         3 second delay
                   |                |
                   |                v
                   |         Clear cart
                   |                |
                   +------>  IDLE (reset)
```

---

## MDB Protocol Commands

The Flask server communicates with the PicoVend EZ Bridge card reader using MDB (Multi-Drop Bus) protocol over serial. Commands are sent as text strings terminated by newlines.

| Command | Direction | Purpose |
|---------|-----------|---------|
| `CSLS1RESET` | To reader | Reset the cashless device to a known state |
| `CSLS1READY` | From reader | Device acknowledges reset, ready for commands |
| `CSLS1ENABLE` | To reader | Enable the contactless interface for transactions |
| `CSLS1BEGIN(...)` | From reader | Customer card tap detected, authorization in progress |
| `CSLS1VNDREQ(price, items)` | To reader | Request payment authorization for the given total price and item count |
| `CSLS1VNDAPP(...)` | From reader | Card approved, payment authorized |
| `CSLS1VNDDEN` | From reader | Card declined, payment rejected |
| `CSLS1VNDSUCC(item, price, remaining, 0)` | To reader | Acknowledge successful dispense of one item. Parameters: item number, item price in pence, remaining items, and a trailing zero |
| `CSLS1VNDFAIL` | To reader | Report that an item failed to dispense |
| `CSLS1ENDSESSION` | To reader | End the current payment session after all items dispensed |

---

## API Reference

### Flask Endpoints

All Flask endpoints require an `Authorization: Bearer <API_TOKEN>` header. The default token is `supersecret`.

#### POST /api/basket/pay

Initiates a payment flow. Returns immediately; payment processing happens in a background thread.

**Request body:**
```json
{
  "slot": 1,
  "items": [
    { "id": 1, "name": "Cola", "price": 150, "qty": 1 },
    { "id": 2, "name": "Chips", "price": 100, "qty": 2 }
  ]
}
```

Prices are in pence (integer). `qty` is the count of that item.

**Response (success):**
```json
{ "ok": true }
```

**Response (error):**
```json
{ "ok": false, "error": "Payment already in progress" }
```

#### POST /api/basket/dispense

Reports one item as dispensed. Call this endpoint repeatedly after payment approval until `done` is true.

**Request body:**
```json
{
  "slot": 1,
  "success": true
}
```

Set `success` to `false` to report a dispense failure (sends `CSLS1VNDFAIL` to the reader).

**Response:**
```json
{
  "ok": true,
  "done": false,
  "remaining": 2
}
```

When `done` is `true`, all items have been dispensed and the session has ended.

#### GET /api/state

Returns the full current state of the payment system.

**Response:**
```json
{
  "pay": {
    "in_progress": true,
    "approved": false,
    "last_status": "Waiting for card tap...",
    "last_error": "",
    "pending_items": [
      { "id": 1, "name": "Cola", "price": 150 },
      { "id": 2, "name": "Chips", "price": 100 }
    ]
  },
  "connected": true,
  "cashless": {
    "last_vndapp": null,
    "last_vndden": null
  }
}
```

### Axum Product Editor Endpoints

These endpoints are served by the Rust Axum server on port 3000. No authentication is required.

#### GET /products

Returns all products from the database.

**Response:**
```json
[
  {
    "product_id": 1,
    "product_name": "Cola",
    "product_category": "Drinks",
    "product_price": 1.50,
    "product_availability": true
  }
]
```

#### POST /products

Creates a new product.

**Request body:**
```json
{
  "product_name": "Cola",
  "product_category": "Drinks",
  "product_price": 1.50,
  "product_availability": true
}
```

**Response:** `201 Created` with body `"ok"`, or `500` with error message.

#### PUT /products/:id

Updates an existing product.

**Request body:** Same as POST.

**Response:** `200 OK` with body `"updated"`, or `500` with error message.

#### DELETE /products/:id

Deletes a product by ID.

**Response:** `200 OK` with body `"deleted"`, or `500` with error message.

#### GET / (and all other paths)

Serves static files from `src-tauri/src/static/`. The default `index.html` is the product editor admin page.

### Tauri Commands

These are the Rust functions exposed to the React frontend via `invoke()`. Each function name corresponds to the first argument of `invoke()`.

| Command | JS Usage | Description |
|---------|----------|-------------|
| `initialize_payment_server` | `await invoke("initialize_payment_server")` | Spawns `app_vend.py` |
| `initialize_static_page_server` | `await invoke("initialize_static_page_server")` | Spawns the Axum server |
| `initialize_orders_database` | `await invoke("initialize_orders_database")` | Creates orders table |
| `initialize_products_database` | `await invoke("initialize_products_database")` | Creates products table |
| `initialize_user_database` | `await invoke("initialize_user_database")` | Creates users table |
| `query_products` | `await invoke("query_products")` | Returns product array |
| `insert_order` | `await invoke("insert_order", { productId, quantity, price })` | Saves an order |
| `new_product` | `await invoke("new_product", { productName, productCategory, productPrice, productAvailability })` | Adds a product |
| `delete_product` | `await invoke("delete_product", { productId })` | Removes a product |
| `initiate_payment` | `await invoke("initiate_payment", { slot, items })` | Starts card payment flow |
| `dispense_item` | `await invoke("dispense_item", { slot, success })` | Dispenses one item |
| `get_pay_state` | `await invoke("get_pay_state")` | Polls card payment state |
| `get_tag_id` | `await invoke("get_tag_id")` | Blocks until NFC tag scanned; returns UID |
| `get_balance_by_tag_id` | `await invoke("get_balance_by_tag_id", { tagId })` | Returns NFC user balance |
| `update_balance_by_tag_id` | `await invoke("update_balance_by_tag_id", { tagId, amount })` | Deducts amount, returns new balance |
| `return_editor_url` | `await invoke("return_editor_url")` | Gets editor URL string |
| `kill_app` | `await invoke("kill_app")` | Kills servers and exits |

---

## Database Schema

### Products Database (`~/data/products.db`)

Table: `products`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `product_id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique product identifier |
| `product_name` | TEXT | NOT NULL | Display name of the product |
| `product_category` | TEXT | NOT NULL | Must match one of the app categories: Drinks, Snacks, Food, Drugs, Questionable |
| `product_price` | REAL | NOT NULL | Price in GBP as a decimal (e.g. 1.50) |
| `product_availability` | INTEGER | NOT NULL DEFAULT 1 | Boolean stored as integer: 1 = available, 0 = hidden |

### Orders Database (`~/data/ordering_system_data.db`)

Table: `orders`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `order_id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique order identifier |
| `product_id` | INTEGER | NOT NULL | References the product that was ordered |
| `quantity` | INTEGER | NOT NULL | Number of units ordered |
| `price` | FLOAT | NOT NULL | Total price paid for this line item (product_price * quantity) |
| `timestamp` | DATETIME | DEFAULT CURRENT_TIMESTAMP | When the order was placed |

Note: There is no foreign key constraint between orders and products. If a product is deleted, its historical orders remain in the orders database.

### Users Database (`~/data/ordering_system_users.db`)

Table: `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique user identifier |
| `tag_id` | TEXT | NOT NULL UNIQUE | NFC tag UID stored as lowercase hex (e.g. `a1b2c3d4`) |
| `full_name` | TEXT | NOT NULL | Display name |
| `is_admin` | INTEGER | NOT NULL DEFAULT 0 | Boolean stored as integer: 1 = admin, 0 = regular user |
| `balance` | REAL | NOT NULL DEFAULT 0 | GBP balance available for NFC payments |

Admin users are those with `is_admin = 1`. Their tag UIDs are checked by the NFC listener at runtime to determine whether to emit `nfc-admin-found` or `nfc-unknown-tag`.

**Accessing the users database manually:**
```
cd ~/data
sqlite3 ordering_system_users.db
SELECT * FROM users;
```

---

## Configuration

### Flask Environment Variables

Set these before running `app_vend.py`:

| Variable | Default | Description |
|----------|---------|-------------|
| `MDB_PORT` | `/dev/ttyUSB0` | Serial port path for the card reader |
| `MDB_BAUD` | `115200` | Baud rate for serial communication |
| `WEB_HOST` | `0.0.0.0` | Flask HTTP server bind address |
| `WEB_PORT` | `8080` | Flask HTTP server port |
| `API_TOKEN` | `supersecret` | Bearer token for API authentication. Must match `API_TOKEN` constant in `lib.rs` |
| `CASHLESS_X` | `1` | Cashless device index (typically 1 for the first reader) |
| `BASKET_MODE` | `0` | Basket mode: 0 = single item mode, 1 = multiple item mode |
| `CARD_TAP_TIMEOUT_S` | `60.0` | Seconds to wait for a customer to tap their card |
| `VNDAPP_TIMEOUT_S` | `30.0` | Seconds to wait for VNDAPP (card approval) response from the reader |

### Tauri Constants (`lib.rs`)

| Constant | Value | Description |
|----------|-------|---------|
| `FLASK_BASE` | `http://127.0.0.1:8080` | Base URL for Flask. Change if Flask runs on a different port or host |
| `API_TOKEN` | `supersecret` | Must match the Flask `API_TOKEN` environment variable |

### React Constants (`App.tsx`)

| Constant | Value | Description |
|----------|-------|-------------|
| `CATEGORIES` | `["All", "Drinks", "Snacks", "Food", "Questionable"]` | Product category filter tabs. "All" shows everything. Defined in `AppVisualHelpers.tsx` |
| `INITIAL_STATE_FULLSCREEN` | `true` | Whether the app starts in fullscreen mode |
| `SCREENSAVER_TIMEOUT_MINUTES` | `1` | Minutes of inactivity before the screen saver activates |
| `FETCH_PRODUCTS_INTERVAL` | `6000` | Milliseconds between product database polls |
| `NFC_ONLY_MODE` | `false` | Set to `true` to disable the corner double-click admin trigger |

### Frontend Environment Variables (`.env`)

| Variable | Purpose |
|----------|---------|
| `VITE_DOOR_API_URL` | Base URL of the door lock API (used by `hardwareHelpers.tsx`) |
| `VITE_LIGHT_AUTHENTICATION_KEY` | Shelly cloud auth key for the RGB light |
| `VITE_LIGHT_ID` | Shelly device ID for the RGB light |

### Tauri Capabilities (`src-tauri/capabilities/default.json`)

The application requests these permissions:
- `core:default` -- Standard Tauri core permissions
- `opener:default` -- Allows opening URLs in the system browser (for the editor link)
- `core:window:allow-set-fullscreen` -- Allows toggling fullscreen mode

---

## Build Instructions

### Prerequisites

| Requirement | Minimum Version | Purpose |
|-------------|-----------------|---------|
| Node.js | 16+ | React frontend build tooling (Vite) |
| Rust | stable | Tauri backend compilation |
| Python | 3.8+ | Flask payment server |
| pip packages | flask, pyserial | Flask dependencies |
| System packages (Linux) | `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, etc. | Tauri Linux dependencies |

### Backend Setup (Flask)

```bash
# Install Python dependencies
pip install flask pyserial

# Or if using the requirements file:
pip install -r app_vend_requirements.txt

# On Debian/Ubuntu, system packages may be needed:
sudo apt install python3-flask python3-serial
```

### Frontend and Tauri Setup

```bash
# Install Node.js dependencies
npm install

# Development mode (hot reload for React, auto-rebuilds Tauri)
npm run tauri dev

# Production build
npm run tauri build
```

### Cross-Compilation for Raspberry Pi

The Raspberry Pi uses ARM64 architecture. To cross-compile from an x86 machine:

```bash
# Install the ARM64 cross-compiler (Debian/Ubuntu)
sudo apt install gcc-aarch64-linux-gnu

# Add the Rust target
rustup target add aarch64-unknown-linux-gnu

# Build for ARM64
npm run tauri build -- --target aarch64-unknown-linux-gnu
```

Alternatively, build directly on the Raspberry Pi by running `npm run tauri build` on the device itself.

### Starting the Flask Server Manually

The Flask server is normally spawned automatically by the Tauri app on startup. To run it manually for testing:

```bash
# With default settings
python app_vend.py

# With custom settings
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

---

## Troubleshooting

### PIR Motion Sensor (Wiring & Notes)

- The ordering system's motion sensor is wired to physical pin **26** (BOARD numbering), which corresponds to **GPIO7** (BCM numbering). Confirm which numbering scheme you are using when running tests or editing code.
- The PIR module used on this project is powered from **5V** (connect VCC to Pi physical pin 2) and GND to Pi GND (for example physical pin 6). The PIR module OUT pin is connected to the Pi input pin (physical pin 26 in this setup).
- Many common PIR modules provide a 3.3–3.5V output on the OUT pin even when the module is powered from 5V, but you must verify this with a multimeter before connecting. If the OUT pin ever measures ~5V when high, do NOT connect it directly to the Pi GPIO — use a level shifter or a simple voltage divider to bring it down to 3.3V.
- Warm-up: allow the PIR module 20–60 seconds after power-up before expecting reliable motion readings.
- Jumper/mode and potentiometers on the PIR module control single/repeat trigger modes, sensitivity, and delay. If you see constant LOW (or a floating line), check these settings and verify VCC/GND/OUT wiring.
- Quick local test: use the included `test_sensor.py` script to exercise the sensor and run the diagnostic. For BOARD (physical) pin testing run:

```bash
python3 test_sensor.py
```

Also check `src-tauri/src/motion_sensor.rs` for the Tauri-side listener if you need to match the pin used by the Rust bridge.

### NFC Reader (MFRC522) (Wiring & Notes)

- The NFC reader is connected via SPI to the Raspberry Pi and uses `/dev/spidev0.0` in the Rust listener.
- The MFRC522 module is read by `src-tauri/src/nfc.rs` and emits `nfc-admin-found` for allowlisted tags or `nfc-unknown-tag` for any other tag.
- Admin tags are currently hard-coded in `src-tauri/src/nfc.rs` and mapped to the admin access path used by the frontend.
- If an admin tag is recognised, the app opens the admin modal and resets the screen saver state.
- If an unknown tag is detected, the frontend shows a short notification instead of granting access.
- Confirm the SPI wiring, power rails, and ground connections before powering the reader.

### Flask Cannot Connect to Serial Port

**Symptom:**
```
Error: [Errno 2] No such file or directory: '/dev/ttyUSB0'
```

**Causes and solutions:**
- The USB cable to the card reader is not connected. Reconnect it.
- The port name is different. List available ports with `ls /dev/tty*` and update `MDB_PORT`.
- Permission denied. Run with `sudo` or add your user to the `dialout` group: `sudo usermod -aG dialout $USER` then log out and back in.

### Tauri Cannot Reach Flask

**Symptom:**
```
Payment request failed -- is app_vend.py running on :8080?
```

**Causes and solutions:**
- Flask is not running. Check if `app_vend.py` was spawned: `ps aux | grep app_vend`.
- Port 8080 is occupied by another process. Check with `lsof -i :8080` (Linux) or `netstat -ano | findstr 8080` (Windows).
- Flask crashed on startup. Check terminal output for Python errors.
- The `FLASK_BASE` constant in `lib.rs` does not match the actual Flask address/port.

### Card Reader Not Responding

**Symptom:**
```
last_error: "VNDAPP timeout after 30.0s"
```

**Causes and solutions:**
- The card reader is not powered on. Check its power supply.
- The MDB serial cable is disconnected or faulty. Verify physical connections.
- The baud rate is wrong. Ensure `MDB_BAUD` matches the reader's configuration (default 115200).
- The timeout is too short for slow networks/readers. Increase `VNDAPP_TIMEOUT_S`.
- The card reader is not in contactless mode. Consult the PicoVend EZ Bridge documentation.

### Payment Approved But Items Not Dispensing

**Symptom:** The screen shows "Card approved!" but never transitions to "Dispensing..."

**Causes and solutions:**
- The `doDispenseAll()` function is not being called. Check the browser developer console for JavaScript errors.
- The dispense endpoint is failing. Check Flask logs for errors on `POST /api/basket/dispense`.
- The basket is empty in Flask state. Verify with `GET /api/state` that `pending_items` is populated after payment approval.

### Products Not Showing in the React App

**Symptom:** "No products available." displayed on the main screen.

**Causes and solutions:**
- No products have been added. Open the product editor at `http://<machine_ip>:3000` and add products.
- All products have `product_availability` set to false/0. Edit products to mark them as available.
- The products database does not exist yet. It is created automatically when the first product is added.
- The 6-second polling interval means changes take up to 6 seconds to appear. Click "Refresh Products" in the admin panel to force a reload.

### Product Editor Page Not Loading

**Symptom:** Cannot access `http://<machine_ip>:3000`.

**Causes and solutions:**
- The Axum server failed to start. Check Tauri console output for cargo build errors.
- Port 3000 is occupied. Check with `lsof -i :3000` or `netstat -ano | findstr 3000`.
- Firewall is blocking port 3000. Allow incoming connections on port 3000 for LAN access.
- The Axum binary did not compile. Run `cargo build --bin server` in the `src-tauri` directory to check for compilation errors.

### Fullscreen Not Working

**Symptom:** The app window does not go fullscreen on startup.

**Causes and solutions:**
- The Tauri capability `core:window:allow-set-fullscreen` must be present in `src-tauri/capabilities/default.json`.
- On some Linux window managers, fullscreen requests may be ignored. Try a different window manager or use the admin panel toggle.

---

## Development Notes

### Price Handling

Prices follow different formats at different layers:
- **Database:** Stored as `REAL` (float) in GBP (e.g. `1.50`)
- **React state:** Stored as float in GBP (e.g. `1.50`)
- **React to Flask:** Converted to integer pence before sending (`Math.round(price * 100)`, e.g. `150`)
- **Flask to card reader:** Sent as integer pence in MDB commands
- **Orders database:** Stored as float representing total line item price (`product_price * quantity`)

### Asynchronous Payment Flow

Payment approval is entirely asynchronous. Flask spawns a background thread for the MDB communication sequence. React polls the Flask state endpoint every 500 milliseconds to detect state changes. This design means the React UI remains responsive during the entire payment process and can display intermediate status updates from the card reader.

### Error Recovery

If a payment fails at any stage (initiation, card tap timeout, card decline, dispense failure), the system:
1. Sets `payStatus` to `"error"` with a descriptive message
2. Stops polling
3. Displays a "Dismiss" button to the user
4. On dismiss, resets all payment state to idle
5. No items are dispensed on failure
6. No orders are recorded in the database on failure

### Server Process Management

The Tauri application manages two child processes:
1. **Flask server** (`app_vend.py`) -- Spawned via Python on startup. Not tracked in `SERVER_PROCESS` (fire-and-forget).
2. **Axum server** (`cargo run --bin server`) -- Spawned on startup, tracked in `SERVER_PROCESS`. Killed when the app exits or when `kill_app` is called. Also killed and respawned if `initialize_static_page_server` is called again.

### Token Security

The `API_TOKEN` constant in `lib.rs` and the `API_TOKEN` environment variable for Flask must match. The default value `supersecret` should be changed to a strong, unique secret in production deployments. The token is sent as a Bearer token in the Authorization header of all HTTP requests from Tauri to Flask.

### Database Location

Both databases are stored in `~/data/` (the user home directory's `data` subdirectory). On Windows this resolves via `USERPROFILE`, on Linux/macOS via `HOME`, and falls back to the system temp directory. The directory is created automatically if it does not exist.

### Product Category Consistency

The category strings stored in the database must exactly match the category names defined in the `CATEGORIES` constant in `App.jsx` (excluding "All", which is a filter-only category). The product editor dropdown in `index.html` also defines the same categories. If categories need to be changed, all three locations must be updated:
1. `src/App.jsx` -- `CATEGORIES` array
2. `src-tauri/src/static/index.html` -- `<select id="category">` options
3. Existing database records (manually update category values)

### Polling Architecture

The application uses two different polling mechanisms:
1. **Product refresh polling:** Every 6 seconds, `fetchProducts` queries the database for product updates. This runs continuously while the app is open. Note: this reuses `pollRef`, which means starting payment polling will overwrite the product refresh interval. Product refreshing resumes when `fetchProducts` is called again (e.g., from the admin panel "Refresh Products" button).
2. **Payment state polling:** Every 500 milliseconds during an active payment, `startPolling` queries Flask for payment state changes. This is active only between payment initiation and completion/cancellation.

### Known Issues and Inconsistencies

1. The `pollRef` is shared between product refresh polling and payment state polling. Starting a payment stops product refresh polling; it resumes only if `fetchProducts` is called explicitly (e.g. from the admin panel).
2. The Flask server process is spawned but its handle is not stored, so it cannot be cleanly killed on application exit. Only the Axum server process is tracked and killed.
3. The door-closed polling in `handleNFCCheckout` may fire immediately if the lock hardware briefly reports closed on open — a known hardware glitch noted in the code.
4. `get_tag_id` is a blocking Tauri command; calling it will block the Tauri async runtime thread until a tag is scanned. For production use it should be moved to a dedicated thread.

---

## Testing

The frontend test suite uses **Vitest** and **React Testing Library**. All test files live in `src/test/` and are co-located with the source they test.

### Running Tests

```bash
# Run all tests once
npm run test
```

### Test Files

| File | What it covers |
|------|---------------|
| `AppHelpers.test.spec.tsx` | `totalPrice` – edge cases (empty basket, float precision, zero price); `filteredProducts` – category filtering and availability; `statusIcon` – returns correct icon component per status; `getProductIcon` – keyword and category matching |
| `Button.test.spec.tsx` | `PrimaryButton` – render, click, double-click, custom color; `RemoveButton` – render and click |
| `CategoryIndicator.test.spec.tsx` | Renders all category buttons; highlights the active one; calls `onCategoryClick` with the correct argument |
| `hardwareHelpers.test.spec.tsx` | `unlockDoor` – fetch call count, method, URL suffix, return value, error resilience; `setLightsColor` – correct RGB values per colour, Content-Type header, on/brightness payload, error resilience; `isDoorClosed` – invoke call, string/object response parsing, missing key, invoke rejection; `listenToMotionSensor` – listen event name, returns unlisten, fires callback; `listenToNfcAdminFound` – same for `nfc-admin-found`; `listenToNfcUnknownTag` – same for `nfc-unknown-tag`, passes UID payload |
| `Modal.test.spec.tsx` | Renders when `opened` is true, hidden when false; displays title and children; calls `closed` on overlay click; stops propagation on inner click |
| `PriceStatusPill.test.spec.tsx` | Renders both buttons; calls `onModalOpen` and `onCheckout`; displays formatted price |
| `ProductCard.test.spec.tsx` | Renders product name and price; truncates names over 20 characters; calls `onClick`; shows `QuantityBadge` when count > 0; shows `RemoveButton` only when `selected` and `showRemoveButton` are both true |
| `QuantityBadge.test.spec.tsx` | Renders count when > 0; renders nothing for zero/undefined; applies custom color |
| `ScreenSaver.test.spec.tsx` | Renders first slide; advances slides on interval; wraps around after last slide; calls `onClose` on tap; clears timer after tap; handles empty images array; uses default imported images when no prop |

### Test Setup

`src/test/setup.js` loads `@testing-library/jest-dom` matchers globally. Tauri APIs (`@tauri-apps/api/core` and `@tauri-apps/api/event`) are mocked at the module level in each test file using `vi.mock`.

---

## Over-the-Air Updates (Does not work - signature issues)

The application uses the [Tauri updater plugin](https://tauri.app/plugin/updater/) for OTA (over-the-air) updates. When the app starts, it checks a hosted `updates.json` file. If a newer version is available, the user is prompted to install it.

### How It Works

1. On startup, the Tauri updater fetches `updates.json` from the configured endpoint (`plugins.updater.endpoints` in `tauri.conf.json`).
2. It compares the `version` field in `updates.json` against the version compiled into the running binary (`version` in `tauri.conf.json`).
3. If the remote version is newer, the updater downloads the `.deb` file from the `url` field.
4. Before installing, the updater **verifies the signature** of the downloaded file against the `pubkey` in `tauri.conf.json`. If the signature does not match, the update is rejected.
5. On success, the app relaunches into the new version.

### Signing Format

The Tauri updater uses **minisign** format, not raw OpenSSL Ed25519. The signature placed in `updates.json` must be the **full contents of the `.sig` file** produced by `npx tauri signer sign`. Raw OpenSSL-produced signatures will be rejected with "signature could not be decoded".

The `pubkey` in `tauri.conf.json` is also in minisign format, not a DER-encoded OpenSSL public key.

### Key Files

| File | Location | Purpose |
|------|----------|---------|
| `tauri-signing.key` | Repo root (keep secret, do not commit) | Minisign private key used to sign each release |
| `tauri-signing.key.pub` | Repo root | Minisign public key (safe to commit) |
| `signature.b64` | Repo root | Base64 signature of the latest `.deb` (auto-generated, commit this) |
| `updates.json` | Repo root | Update manifest served via GitHub Pages |
| `builds/` | Repo root | Directory containing the latest `.deb` for each architecture |

> **IMPORTANT:** Never regenerate the keypair once machines are deployed. If `tauri-signing.key` is lost, deployed machines will no longer be able to verify updates and OTA updates will stop working permanently. Store the private key securely (e.g. a password manager or encrypted USB).

### Build Requirements — Dedicated Build Pi

**All production builds must be compiled directly on a Raspberry Pi.** The Tauri `.deb` binary must target the exact ARM64 architecture of the deployed machines. Cross-compilation from an x86 machine produces binaries that may not run correctly on the Pi hardware.

One Raspberry Pi should be designated as the **build machine** and used for all releases across all deployed units. This ensures binary compatibility across every machine in the field.

### Release Process (Step by Step)

Follow these steps every time you release a new version:

#### Step 1 — Bump the version

In `src-tauri/tauri.conf.json`, increment the `version` field:

```json
"version": "0.1.1"
```

Also update `updates.json` to match:

```json
"version": "v0.1.1"
```

The version in `updates.json` must have a `v` prefix. The version in `tauri.conf.json` must not.

#### Step 2 — Build on the Raspberry Pi

SSH into the dedicated build Pi, pull the latest code, and build:

```bash
git pull
npm install
npm run tauri build
```

The output `.deb` file will be at:

```
src-tauri/target/release/bundle/deb/ordering_system_<version>_arm64.deb
```

#### Step 3 — Copy the `.deb` back to your dev machine

From your dev machine:

```bash
scp pi@<build-pi-ip>:~/ordering_system/src-tauri/target/release/bundle/deb/ordering_system_<version>_arm64.deb builds/
```

Replace `<build-pi-ip>` with the IP address of the build Pi and `<version>` with the version you built.

#### Step 4 — Sign the build

On your dev machine, from the repo root:

```bash
TAURI_SIGNING_PRIVATE_KEY_PATH=tauri-signing.key npx tauri signer sign builds/ordering_system_<version>_arm64.deb
```

You will be prompted for the private key password. This produces two files:

| Generated file | Location | What it is |
|----------------|----------|------------|
| `ordering_system_<version>_arm64.deb.sig` | `builds/` | The minisign signature file for this build. This is what goes into `updates.json` |
| (the `.deb` itself is unchanged) | `builds/` | The binary you copied from the Pi — signing does not modify it |

Now copy the `.sig` contents into `signature.b64` at the repo root:

```bash
cp builds/ordering_system_<version>_arm64.deb.sig signature.b64
```

`signature.b64` is a convenience copy of the latest signature kept at the repo root for reference. The actual value that matters is what you paste into `updates.json` in the next step.

> **Important:** The `.sig` file contains multiple lines (a comment header + the signature). When pasting into `updates.json`, the entire multi-line content must be base64-encoded as a single unbroken string — this is exactly what `npx tauri signer sign` outputs and what the `.sig` file contains. Do not manually strip lines or re-encode it.

#### Step 5 — Update `updates.json`

Edit `updates.json` to point to the new build:

```json
{
  "version": "v<version>",
  "notes": "Short description of what changed.",
  "pub_date": "<YYYY-MM-DDTHH:MM:SSZ>",
  "platforms": {
    "linux-aarch64": {
      "signature": "<full contents of signature.b64 — one line, no newlines>",
      "url": "https://raw.githubusercontent.com/KareemSab278/ordering_system/main/builds/ordering_system_<version>_arm64.deb"
    }
  }
}
```

> **Critical:** The `signature` value must be a single uninterrupted line with no embedded newlines or spaces inside the string. Any line break inside the base64 string will cause "signature could not be decoded" on all machines.

#### Step 6 — Commit and push

```bash
git add builds/ordering_system_<version>_arm64.deb signature.b64 updates.json src-tauri/tauri.conf.json
git commit -m "Release v<version>"
git push
```

GitHub Pages will automatically serve the updated `updates.json` within a minute. Deployed machines will pick up the update the next time they check (on app startup).

#### Step 7 — Verify

To confirm the hosted `updates.json` is correct and the signature string contains no hidden newlines, run:

```bash
curl -sS https://KareemSab278.github.io/ordering_system/updates.json | \
  python3 -c "import json,sys; d=json.load(sys.stdin); s=d['platforms']['linux-aarch64']['signature']; print(repr(s))"
```

The output must be a single quoted string with no `\n` characters inside it.

### Generating the Keypair (First Time Only)

This only needs to be done once. If you already have `tauri-signing.key` and `tauri-signing.key.pub`, skip this.

```bash
npx tauri signer generate -w tauri-signing.key
```

Take the public key from `tauri-signing.key.pub` and put it in `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. Rebuild and redeploy all machines for the new key to take effect.

### Troubleshooting Updates

| Error | Cause | Fix |
|-------|-------|-----|
| `signature could not be decoded` | The signature string in `updates.json` contains embedded newlines or is in the wrong format (raw OpenSSL instead of minisign) | Re-sign using `npx tauri signer sign` and ensure the signature is one unbroken line |
| `Download request failed with status 404` | The `.deb` URL in `updates.json` points to a page that does not exist | Verify the file exists at the URL by pasting it into a browser. Ensure the filename in the URL exactly matches the uploaded file |
| `public key mismatch` or silent failure | The `pubkey` in `tauri.conf.json` was generated from a different keypair than the one used to sign the `.deb` | Use `tauri-signing.key.pub` to derive the pubkey: `cat tauri-signing.key.pub` and copy the full content into `tauri.conf.json` |
| Update prompt appears but nothing installs | The updater downloaded the file but `downloadedPath` is null on Linux ARM | The `updateHandler.js` fallback to `downloadAndInstall()` handles this case automatically |
| Update not offered despite newer version in `updates.json` | App is running in dev mode (`npm run tauri dev`) | The updater only works in installed release builds. Install the `.deb` with a lower version to test |