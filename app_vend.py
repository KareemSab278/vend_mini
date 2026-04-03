#!/usr/bin/env python3
import os
import time
import json
import queue
import threading
import re
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any, List

from pathlib import Path
from dotenv import load_dotenv
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

import serial
from flask import Flask, request, jsonify, Response, abort

# ----------------------------
# Config (env overridable)
# ----------------------------
SERIAL_PORT = os.environ.get("MDB_PORT", "/dev/ttyUSB1")
BAUDRATE = int(os.environ.get("MDB_BAUD", "115200"))
READ_TIMEOUT_S = float(os.environ.get("MDB_READ_TIMEOUT", "0.2"))
WEB_HOST = os.environ.get("WEB_HOST", "0.0.0.0")
WEB_PORT = int(os.environ.get("WEB_PORT", "8080"))
API_TOKEN = os.environ.get("API_TOKEN") # Must be set in env for security; default is disabled to prevent accidental exposure.
CASHLESS_X = int(os.environ.get("CASHLESS_X", "1"))
BASKET_MODE = os.environ.get("BASKET_MODE", "0")
CARD_TAP_TIMEOUT_S = float(os.environ.get("CARD_TAP_TIMEOUT_S", "60.0"))
VNDAPP_TIMEOUT_S = float(os.environ.get("VNDAPP_TIMEOUT_S", "30.0"))

# ----------------------------
# Helpers
# ----------------------------
def now_ms() -> int:
    return int(time.time() * 1000)

def require_token(req):
    auth = req.headers.get("Authorization", "") or (req.args.get("auth") or "").strip()
    if auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1].strip()
    else:
        token = auth.strip()
    if not token:
        abort(401)
    if token != API_TOKEN:
        abort(403) # unauthorized!


def crlf_line(s: str) -> bytes:
    if not s.endswith("\r\n"):
        s = s + "\r\n"
    return s.encode("ascii", errors="replace")


# ----------------------------
# Event model
# ----------------------------
@dataclass
class Event:
    ts_ms: int
    kind: str
    line: str
    parsed: Optional[Dict[str, Any]] = None


# ----------------------------
# MDB Bridge Client
# ----------------------------
class MdbBridge:
    def __init__(self, port: str, baud: int):
        self.port = port
        self.baud = baud
        self.ser: Optional[serial.Serial] = None

        self._rx_thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._pay_cancel = threading.Event()

        self.events: "queue.Queue[Event]" = queue.Queue(maxsize=5000)
        self._pending_lines: "queue.Queue[str]" = queue.Queue()

        self.state_lock = threading.Lock()
        self.state: Dict[str, Any] = {
            "connected": False,
            "port": self.port,
            "baud": self.baud,
            "last_rx": "",
            "last_tx": "",
            "cashless": {
                "ready_seen": False,
                "basket_mode": int(BASKET_MODE),
                "last_begin": None,
                "last_vndapp": None,
                "last_vndden": None,
                "last_endsession": None,
                "last_display": None,
                "last_error": None,
            },
            "pay": {
                "in_progress": False,
                "approved": False,
                "last_status": "",
                "last_error": "",
                "pending_items": [],
            },
        }

        self.re_cashless_ready      = re.compile(r"^CSLS(\d+)READY$")
        self.re_cashless_begin      = re.compile(r"^CSLS(\d+)BEGIN\(([^)]*)\)$")
        self.re_cashless_vndapp     = re.compile(r"^CSLS(\d+)VNDAPP\(([^)]*)\)$")
        self.re_cashless_vndden     = re.compile(r"^CSLS(\d+)VNDDEN$")
        self.re_cashless_endsession = re.compile(r"^CSLS(\d+)ENDSESSION$")
        self.re_cashless_canceled   = re.compile(r"^CSLS(\d+)CANCELED$")
        self.re_cashless_dispmsg    = re.compile(r"^CSLS(\d+)DISPMSG\(([^)]*)\)$")
        self.re_cashless_malfunction = re.compile(r"^CSLS(\d+)MALFUNCTION\(([^)]*)\)$")
        self.re_cashless_cmdoutofseq = re.compile(r"^CSLS(\d+)CMDOUTOFSEQ$")

    def start(self):
        self.open()
        self._stop.clear()
        self._rx_thread = threading.Thread(target=self._rx_loop, name="mdb-rx", daemon=True)
        self._rx_thread.start()
        self._emit("info", f"Serial reader started on {self.port}@{self.baud}")

    def stop(self):
        self._stop.set()
        if self._rx_thread:
            self._rx_thread.join(timeout=2.0)
        self.close()

    def open(self):
        self.close()
        self.ser = serial.Serial(
            port=self.port,
            baudrate=self.baud,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=READ_TIMEOUT_S,
            write_timeout=1.0,
            rtscts=False,
            dsrdtr=False,
        )
        with self.state_lock:
            self.state["connected"] = True
        self._emit("state", f"Connected to {self.port}@{self.baud}")

    def close(self):
        if self.ser:
            try:
                self.ser.close()
            except Exception:
                pass
        self.ser = None
        with self.state_lock:
            self.state["connected"] = False


    def _emit(self, kind: str, line: str, parsed: Optional[Dict[str, Any]] = None):
        ev = Event(ts_ms=now_ms(), kind=kind, line=line, parsed=parsed)
        try:
            self.events.put_nowait(ev)
        except queue.Full:
            try:
                _ = self.events.get_nowait()
                self.events.put_nowait(ev)
            except Exception:
                pass


    def _rx_loop(self):
        buf = b""
        while not self._stop.is_set():
            if not self.ser:
                time.sleep(0.2)
                continue
            try:
                chunk = self.ser.read(512)
                if not chunk:
                    continue
                buf += chunk
                while b"\n" in buf:
                    line_bytes, buf = buf.split(b"\n", 1)
                    line = line_bytes.strip(b"\r").decode("ascii", errors="replace").strip()
                    if not line:
                        continue
                    with self.state_lock:
                        self.state["last_rx"] = line
                    parsed = self._parse_unsolicited(line)
                    self._emit("rx", line, parsed=parsed)
                    self._pending_lines.put(line)
            except Exception as e:
                with self.state_lock:
                    self.state["cashless"]["last_error"] = str(e)
                self._emit("error", f"Serial RX error: {e}")
                time.sleep(0.5)


    def _parse_unsolicited(self, line: str) -> Optional[Dict[str, Any]]:
        m = self.re_cashless_ready.match(line)
        if m:
            x = int(m.group(1))
            if x == CASHLESS_X:
                with self.state_lock:
                    self.state["cashless"]["ready_seen"] = True
            return {"type": "CSLS_READY", "x": x}

        m = self.re_cashless_begin.match(line)
        if m:
            x = int(m.group(1))
            args = m.group(2)
            parsed_args = [a.strip() for a in args.split(",")] if args else []
            payload = {"type": "CSLS_BEGIN", "x": x, "args": parsed_args}
            if x == CASHLESS_X:
                with self.state_lock:
                    self.state["cashless"]["last_begin"] = payload
            return payload

        m = self.re_cashless_vndapp.match(line)
        if m:
            x = int(m.group(1))
            args = m.group(2)
            parsed_args = [a.strip() for a in args.split(",")] if args else []
            payload = {"type": "CSLS_VNDAPP", "x": x, "args": parsed_args}
            if x == CASHLESS_X:
                with self.state_lock:
                    self.state["cashless"]["last_vndapp"] = payload
            return payload

        m = self.re_cashless_vndden.match(line)
        if m:
            x = int(m.group(1))
            payload = {"type": "CSLS_VNDDEN", "x": x}
            if x == CASHLESS_X:
                with self.state_lock:
                    self.state["cashless"]["last_vndden"] = payload
            return payload

        m = self.re_cashless_endsession.match(line)
        if m:
            x = int(m.group(1))
            payload = {"type": "CSLS_ENDSESSION", "x": x}
            if x == CASHLESS_X:
                with self.state_lock:
                    self.state["cashless"]["last_endsession"] = payload
            return payload

        m = self.re_cashless_canceled.match(line)
        if m:
            x = int(m.group(1))
            return {"type": "CSLS_CANCELED", "x": x}

        m = self.re_cashless_dispmsg.match(line)
        if m:
            x = int(m.group(1))
            args = [a.strip() for a in m.group(2).split(",")] if m.group(2) else []
            payload = {"type": "CSLS_DISPMSG", "x": x, "args": args}
            if x == CASHLESS_X:
                with self.state_lock:
                    self.state["cashless"]["last_display"] = payload
            return payload

        m = self.re_cashless_malfunction.match(line)
        if m:
            x = int(m.group(1))
            code = m.group(2).strip()
            payload = {"type": "CSLS_MALFUNCTION", "x": x, "code": code}
            if x == CASHLESS_X:
                with self.state_lock:
                    self.state["cashless"]["last_error"] = payload
            return payload

        m = self.re_cashless_cmdoutofseq.match(line)
        if m:
            x = int(m.group(1))
            payload = {"type": "CSLS_CMDOUTOFSEQ", "x": x}
            if x == CASHLESS_X:
                with self.state_lock:
                    self.state["cashless"]["last_error"] = payload
            return payload

        return None


    def send(self, cmd: str):
        if not self.ser:
            raise RuntimeError("Serial not connected")
        with self.state_lock:
            self.state["last_tx"] = cmd
        self._emit("tx", cmd)
        self.ser.write(crlf_line(cmd))
        self.ser.flush()

    def send_and_wait_any(self, cmd: str, timeout_s: float = 2.0) -> List[str]:
        self.send(cmd)
        deadline = time.time() + timeout_s
        got: List[str] = []
        while time.time() < deadline:
            try:
                line = self._pending_lines.get(timeout=0.2)
                got.append(line)
            except queue.Empty:
                pass
        return got

    def snapshot(self) -> Dict[str, Any]:
        with self.state_lock:
            return json.loads(json.dumps(self.state))


# ----------------------------
# Payment flow (background thread)
# ----------------------------
def _pay_flow(items: List[Dict[str, Any]]):

    x = CASHLESS_X

    def set_status(msg: str):
        with bridge.state_lock:
            bridge.state["pay"]["last_status"] = msg

    def set_error(msg: str):
        with bridge.state_lock:
            bridge.state["pay"]["in_progress"] = False
            bridge.state["pay"]["last_error"] = msg

    try:
        # Clear stale state from any previous session
        with bridge.state_lock:
            bridge.state["cashless"]["last_vndapp"] = None
            bridge.state["cashless"]["last_vndden"] = None
            bridge.state["cashless"]["last_begin"]  = None
            bridge.state["cashless"]["ready_seen"]  = False

        # 1. RESET — triggers re-initialisation; device will emit CSLS<X>READY
        set_status("Resetting cashless device…")
        bridge.send_and_wait_any(f"CSLS{x}RESET", timeout_s=3.0)

        # 2. Wait for CSLS<X>READY (Appendix IV step 4: enable only after READY)
        set_status("Waiting for cashless device ready…")
        deadline = time.time() + 8.0
        while time.time() < deadline:
            if bridge._pay_cancel.is_set():
                return
            with bridge.state_lock:
                rdy = bridge.state["cashless"].get("ready_seen", False)
            if rdy:
                break
            time.sleep(0.2)
        # Proceed even if READY was missed (some devices skip it)

        if bridge._pay_cancel.is_set():
            return

        # 3. ENABLE
        set_status("Enabling cashless device…")
        bridge.send_and_wait_any(f"CSLS{x}ENABLE", timeout_s=2.0)

        # 4. Send VNDREQ immediately — per Appendix IV the VMC sends the price
        #    FIRST; the customer then taps to approve (VNDAPP).
        #    For Level 3 / Always-Idle devices the device is already active.
        #    For Level 2 devices we may get NOSESSION and must wait for BEGIN first.
        total_price = sum(item["price"] * item["qty"] for item in items)
        num_items   = sum(item["qty"]   for item in items)

        if int(BASKET_MODE) == 1:
            vndreq_cmd = f"CSLS{x}VNDREQ({total_price},{num_items},0)"
        else:
            vndreq_cmd = f"CSLS{x}VNDREQ({total_price},1)"

        set_status(f"Tap your card to pay…")
        lines = bridge.send_and_wait_any(vndreq_cmd, timeout_s=2.5)

        # NOSESSION means Level 2 device — wait for BEGIN (card tap) then retry
        if any("NOSESSION" in l for l in lines):
            set_status("Please tap your contactless card…")
            deadline = time.time() + CARD_TAP_TIMEOUT_S
            while time.time() < deadline:
                if bridge._pay_cancel.is_set():
                    return
                with bridge.state_lock:
                    began = bridge.state["cashless"].get("last_begin") is not None
                if began:
                    break
                time.sleep(0.2)
            else:
                set_error("Timeout: no card presented within the allowed time")
                return
            # Session is now open — retry VNDREQ
            set_status("Authorising payment…")
            bridge.send_and_wait_any(vndreq_cmd, timeout_s=2.5)

        # 5. Wait for VNDAPP (card approved) or VNDDEN (declined)
        deadline = time.time() + VNDAPP_TIMEOUT_S
        while time.time() < deadline:
            if bridge._pay_cancel.is_set():
                return
            with bridge.state_lock:
                vndapp = bridge.state["cashless"].get("last_vndapp")
                vndden = bridge.state["cashless"].get("last_vndden")
            if vndapp:
                with bridge.state_lock:
                    bridge.state["pay"]["approved"] = True
                    bridge.state["pay"]["last_status"] = "Card approved!"
                return
            if vndden:
                set_error("Card declined")
                return
            time.sleep(0.2)

        set_error("Timeout waiting for card approval")

    except Exception as e:
        set_error(str(e))


# ----------------------------
# Flask app
# ----------------------------
app = Flask(__name__)
bridge = MdbBridge(SERIAL_PORT, BAUDRATE)
bridge.start() 


# ── /api/basket/pay ──────────────────────────────────────────────────────────
# Called by Tauri's `initiate_payment` command.
# Body: { "slot": N, "items": [{"id", "name", "price", "qty"}, …] }
# Returns {"ok": true} immediately; the actual approval arrives asynchronously.
# Poll GET /api/state — state.pay.approved becomes true once VNDAPP is received.
@app.post("/api/basket/pay")
def api_basket_pay():
    require_token(request)
    data = request.get_json(force=True, silent=False) or {}
    items = data.get("items", [])

    if not items:
        return jsonify({"ok": False, "error": "items list is empty"}), 400

    # Reset pay state and store basket for dispense tracking
    with bridge.state_lock:
        bridge.state["pay"] = {
            "in_progress": True,
            "approved": False,
            "last_status": "Starting payment…",
            "last_error": "",
            # pending_items is a flat list; each entry is one unit (qty expanded).
            # item_no is a 1-based sequential counter used in basket VNDSUCC/VNDFAIL.
            "pending_items": [
                {"item_no": idx + 1, "id": item.get("id", 1), "name": item.get("name", ""), "price": item.get("price", 0)}
                for idx, item in enumerate(
                    item
                    for item in items
                    for _ in range(max(int(item.get("qty", 1)), 1))
                )
            ],
        }

    bridge._pay_cancel.clear()
    t = threading.Thread(target=_pay_flow, args=(items,), daemon=True, name="pay-flow")
    t.start()

    return jsonify({"ok": True})


# ── /api/basket/dispense ─────────────────────────────────────────────────────
# Called by Tauri's `dispense_item` command once per item after card approval.
# Body: { "slot": N, "success": true/false }
# Returns:
#   {"ok": true, "done": false, "remaining": N}   — more items pending
#   {"ok": true, "done": true,  "remaining": 0}   — basket complete
@app.post("/api/basket/dispense")
def api_basket_dispense():
    require_token(request)
    data = request.get_json(force=True, silent=False) or {}
    success = bool(data.get("success", True))

    x = CASHLESS_X

    with bridge.state_lock:
        pending: List[Dict] = bridge.state["pay"].get("pending_items", [])

    if not pending:
        return jsonify({"ok": True, "done": True, "remaining": 0})

    item = pending[0]
    item_price = item.get("price", 0)
    item_id    = item.get("id", 1)
    item_no    = item.get("item_no", 1)

    # Always send with remaining=0 to close the entire basket in one shot.
    # There is no physical per-item dispenser — the user opens the door and takes items.
    if int(BASKET_MODE) == 1:
        if success:
            cmd = f"CSLS{x}SESSCOMPLETE?({item_no},{item_price},0,0)"
        else:
            cmd = f"CSLS{x}VNDFAIL({item_no},{item_price},0,0)"
    else:
        if success:
            cmd = f"CSLS{x}SESSCOMPLETE?({item_id},{item_price},0,0)"
        else:
            cmd = f"CSLS{x}VNDFAIL({item_id},{item_price},0,0)"

    lines = bridge.send_and_wait_any(cmd, timeout_s=2.0)

    # Clear all pending items — basket is now closed
    with bridge.state_lock:
        bridge.state["pay"]["pending_items"] = []
        bridge.state["pay"]["in_progress"] = False

    return jsonify({"ok": True, "done": True, "remaining": 0, "lines": lines})


@app.post("/api/state/terminate")
def api_state_terminate():
    require_token(request)
    bridge._pay_cancel.set()
    try:
        bridge.send_and_wait_any(f"CSLS{CASHLESS_X}CANCEL", timeout_s=1.5)
    except Exception:
        pass
    with bridge.state_lock:
        bridge.state["pay"] = {
            "in_progress": False,
            "approved": False,
            "last_status": "",
            "last_error": "",
            "pending_items": [],
        }
    return jsonify({"ok": True})


# ── Existing endpoints ────────────────────────────────────────────────────────

@app.get("/api/state")
def api_state():
    require_token(request)
    return jsonify(bridge.snapshot())


@app.post("/api/raw")
def api_raw():
    require_token(request)
    data = request.get_json(force=True, silent=False) or {}
    cmd = (data.get("cmd") or "").strip()
    if not cmd:
        return jsonify({"ok": False, "error": "cmd required"}), 400
    try:
        lines = bridge.send_and_wait_any(cmd, timeout_s=float(data.get("timeout_s") or 1.5))
        return jsonify({"ok": True, "sent": cmd, "lines": lines})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/api/cashless/reset")
def api_cashless_reset():
    require_token(request)
    cmd = f"CSLS{CASHLESS_X}RESET"
    lines = bridge.send_and_wait_any(cmd, timeout_s=3.0)
    return jsonify({"ok": True, "cmd": cmd, "lines": lines})


@app.post("/api/cashless/enable")
def api_cashless_enable():
    require_token(request)
    cmd = f"CSLS{CASHLESS_X}ENABLE"
    lines = bridge.send_and_wait_any(cmd, timeout_s=2.0)
    return jsonify({"ok": True, "cmd": cmd, "lines": lines})


@app.post("/api/cashless/disable")
def api_cashless_disable():
    require_token(request)
    cmd = f"CSLS{CASHLESS_X}DISABLE"
    lines = bridge.send_and_wait_any(cmd, timeout_s=2.0)
    return jsonify({"ok": True, "cmd": cmd, "lines": lines})


@app.post("/api/cashless/cancel")
def api_cashless_cancel():
    require_token(request)
    cmd = f"CSLS{CASHLESS_X}CANCEL"
    lines = bridge.send_and_wait_any(cmd, timeout_s=2.0)
    return jsonify({"ok": True, "cmd": cmd, "lines": lines})


@app.get("/api/alive")
def api_alive():
    require_token(request)
    cmd = "ALIVE?"
    lines = bridge.send_and_wait_any(cmd, timeout_s=1.5)
    return jsonify({"ok": True, "cmd": cmd, "lines": lines})


@app.get("/api/events")
def api_events():
    require_token(request)

    def gen():
        yield f"data: {json.dumps({'kind':'info','line':'SSE connected','ts_ms':now_ms()})}\n\n"
        yield f"data: {json.dumps({'kind':'state','line':'snapshot','ts_ms':now_ms(),'snapshot':bridge.snapshot()})}\n\n"
        while True:
            try:
                ev = bridge.events.get(timeout=15.0)
                payload = asdict(ev)
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            except queue.Empty:
                yield f"data: {json.dumps({'kind':'info','line':'keepalive','ts_ms':now_ms()})}\n\n"

    return Response(gen(), mimetype="text/event-stream")


@app.get("/healthz")
def healthz():
    return "ok", 200


def main():
    print(f"[app_vend] Token  : API_TOKEN env var (currently {'NOT SET' if not API_TOKEN else 'SET'})")
    print(f"[app_vend] Starting on http://{WEB_HOST}:{WEB_PORT}")
    print(f"[app_vend] Serial : {SERIAL_PORT} @ {BAUDRATE} baud (no flow control)")
    print(f"[app_vend] Basket mode: {BASKET_MODE}")
    app.run(host=WEB_HOST, port=WEB_PORT, threaded=True)


if __name__ == "__main__":
    main()
