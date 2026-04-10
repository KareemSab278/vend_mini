#!/usr/bin/env python3
import os
import platform
import queue
import shutil
import sqlite3
import subprocess
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox

DB_FILENAME = "ordering_system_users.db"
PASSWORD = "adminpass" # test password for now. will remove later
DESKTOP_FILE_NAME = "Ordering System Admin Creator.desktop"

REPO_ROOT = Path(__file__).resolve().parent
DATA_DIR = Path.home() / "data"
DB_PATH = DATA_DIR / DB_FILENAME
CARGO_MANIFEST = REPO_ROOT / "src-tauri" / "Cargo.toml"
TAG_LISTENER_BIN = REPO_ROOT / "src-tauri" / "target" / "debug" / "tag_listener"


def create_desktop_shortcut() -> None:
    desktop_dir = Path.home() / "Desktop"
    desktop_dir.mkdir(parents=True, exist_ok=True)
    desktop_path = desktop_dir / DESKTOP_FILE_NAME
    desktop_contents = f"""[Desktop Entry]
Type=Application
Name=Ordering System Admin Creator
Comment=Create the first admin user and watch NFC tags in real time.
Exec=python3 {REPO_ROOT / 'create_admin.py'}
Terminal=true
Categories=Utility;
Icon=applications-system
"""

    try:
        if not desktop_path.exists() or desktop_path.read_text() != desktop_contents:
            desktop_path.write_text(desktop_contents)
            desktop_path.chmod(0o755)
    except OSError as exc:
        print(f"Could not create desktop shortcut: {exc}")


class AdminCreatorApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Ordering System Admin Creator")
        self.root.resizable(False, False)

        self.tag_queue = queue.Queue()
        self.scanned_tags = []
        self.selected_tag = None
        self.is_scanning = False
        self.stop_event = threading.Event()

        self._ensure_database()
        self._build_login_frame()
        self._build_main_frame()

        self.frame_login.pack(fill="both", expand=True, padx=16, pady=16)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        self.root.after(100, self._process_queue)

    def _ensure_database(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                tag_id TEXT NOT NULL UNIQUE,
                full_name TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                balance REAL NOT NULL DEFAULT 0
            );
            """
        )
        conn.commit()
        conn.close()

    def _build_login_frame(self):
        self.frame_login = tk.Frame(self.root)
        tk.Label(self.frame_login, text="Enter password to open admin creator", font=("Arial", 12)).pack(pady=(0, 12))

        self.password_var = tk.StringVar()
        password_entry = tk.Entry(self.frame_login, textvariable=self.password_var, show="*", width=30)
        password_entry.pack(pady=(0, 12))
        password_entry.focus()

        login_button = tk.Button(self.frame_login, text="Unlock", width=16, command=self._validate_password)
        login_button.pack()

    def _build_main_frame(self):
        self.frame_main = tk.Frame(self.root)

        top_label = tk.Label(self.frame_main, text="Admin creator — scan NFC tags to display real-time UID values", font=("Arial", 11), wraplength=420)
        top_label.pack(pady=(0, 8))

        self.status_label = tk.Label(self.frame_main, text="Waiting for NFC tag scanner...", fg="blue", anchor="w", justify="left")
        self.status_label.pack(fill="x", pady=(0, 8))

        self.admin_status_label = tk.Label(self.frame_main, text="Checking admin status...", fg="darkgreen", anchor="w", justify="left")
        self.admin_status_label.pack(fill="x", pady=(0, 8))

        tag_list_frame = tk.Frame(self.frame_main)
        tag_list_frame.pack(fill="both", pady=(0, 8))

        tk.Label(tag_list_frame, text="Scanned Tags:").pack(anchor="w")
        self.tags_listbox = tk.Listbox(tag_list_frame, width=60, height=9, activestyle="none")
        self.tags_listbox.pack(side="left", fill="both", expand=True)
        self.tags_listbox.bind("<<ListboxSelect>>", self._on_listbox_select)

        scrollbar = tk.Scrollbar(tag_list_frame, orient="vertical", command=self.tags_listbox.yview)
        scrollbar.pack(side="right", fill="y")
        self.tags_listbox.config(yscrollcommand=scrollbar.set)

        form_frame = tk.Frame(self.frame_main)
        form_frame.pack(fill="x", pady=(0, 8))

        tk.Label(form_frame, text="Admin full name:").grid(row=0, column=0, sticky="w")
        self.full_name_var = tk.StringVar()
        tk.Entry(form_frame, textvariable=self.full_name_var, width=40).grid(row=1, column=0, sticky="w")

        self.create_button = tk.Button(self.frame_main, text="Create admin from latest scanned tag", width=32, command=self._create_admin)
        self.create_button.pack(pady=(8, 0))

        self.refresh_button = tk.Button(self.frame_main, text="Refresh admin status", width=20, command=self._update_admin_status)
        self.refresh_button.pack(pady=(12, 0))

        self._update_admin_status()

    def _validate_password(self):
        if self.password_var.get() == PASSWORD:
            self.frame_login.pack_forget()
            self.frame_main.pack(fill="both", expand=True, padx=16, pady=16)
            self._start_listener()
            self._update_admin_status()
        else:
            messagebox.showerror("Invalid password", "Password is incorrect.")
            self.password_var.set("")

    def _start_listener(self):
        if not self.is_scanning:
            self.is_scanning = True
            self.stop_event.clear()
            self.listener_thread = threading.Thread(target=self._scanner_loop, daemon=True)
            self.listener_thread.start()

    def _scanner_loop(self):
        if platform.system() != "Linux":
            self.tag_queue.put("ERROR: NFC scanner only supported on Linux.")
            return

        command = self._scanner_command()
        if command is None:
            self.tag_queue.put("ERROR: No NFC tag listener available. Install Rust and build tag_listener.")
            return

        while self.is_scanning and not self.stop_event.is_set():
            try:
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                )
            except FileNotFoundError as exc:
                self.tag_queue.put(f"ERROR: {exc}")
                return

            if process.stdout is None:
                self.tag_queue.put("ERROR: NFC process has no stdout.")
                return

            for line in process.stdout:
                if not self.is_scanning or self.stop_event.is_set():
                    break
                value = line.strip()
                if value:
                    self.tag_queue.put(value)

            process.wait()
            if process.returncode != 0 and self.is_scanning and not self.stop_event.is_set():
                stderr = process.stderr.read() if process.stderr else ""
                msg = stderr.strip() or f"Tag listener exited with code {process.returncode}."
                self.tag_queue.put(f"ERROR: {msg}")
                break

    def _scanner_command(self):
        if TAG_LISTENER_BIN.exists():
            return [str(TAG_LISTENER_BIN)]

        if shutil.which("cargo"):
            return [
                "cargo",
                "run",
                "--manifest-path",
                str(CARGO_MANIFEST),
                "--quiet",
                "--bin",
                "tag_listener",
            ]

        return None

    def _process_queue(self):
        try:
            while True:
                value = self.tag_queue.get_nowait()
                if value.startswith("ERROR:"):
                    self.status_label.config(text=value, fg="red")
                else:
                    self._add_scanned_tag(value)
        except queue.Empty:
            pass
        self.root.after(100, self._process_queue)

    def _add_scanned_tag(self, tag_id: str):
        if tag_id in self.scanned_tags:
            self.status_label.config(text=f"Last scanned tag: {tag_id}", fg="blue")
            return

        self.scanned_tags.append(tag_id)
        self.tags_listbox.insert(tk.END, tag_id)
        self.tags_listbox.selection_clear(0, tk.END)
        self.tags_listbox.selection_set(tk.END)
        self.tags_listbox.see(tk.END)
        self.selected_tag = tag_id
        self.status_label.config(text=f"Last scanned tag: {tag_id}", fg="blue")

    def _on_listbox_select(self, event):
        selection = self.tags_listbox.curselection()
        if selection:
            self.selected_tag = self.tags_listbox.get(selection[0])

    def _update_admin_status(self):
        admin_count = self._count_admins()
        if admin_count == 0:
            self.admin_status_label.config(text="No admin exists. First scanned tag can be added as admin.", fg="darkgreen")
            self.create_button.config(state="normal")
        else:
            self.admin_status_label.config(text=f"Admin exists ({admin_count}). Additional admins cannot be created here.", fg="darkred")
            self.create_button.config(state="disabled")

    def _count_admins(self) -> int:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(1) FROM users WHERE is_admin = 1")
        count = cursor.fetchone()[0] or 0
        conn.close()
        return count

    def _create_admin(self):
        if self._count_admins() != 0:
            messagebox.showinfo("Admin already present", "An admin already exists in the database.")
            self._update_admin_status()
            return

        tag_id = self.selected_tag or (self.scanned_tags[-1] if self.scanned_tags else None)
        full_name = self.full_name_var.get().strip()

        if not tag_id:
            messagebox.showerror("No tag", "Scan an NFC tag before creating an admin.")
            return

        if not full_name:
            messagebox.showerror("Missing name", "Please enter the full name for the admin.")
            return

        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO users (tag_id, full_name, is_admin, balance) VALUES (lower(?), ?, 1, 0)",
                (tag_id, full_name),
            )
            conn.commit()
            conn.close()
            messagebox.showinfo("Success", f"Admin created for tag {tag_id}.")
            self._update_admin_status()
            self.create_button.config(state="disabled")
        except sqlite3.IntegrityError as exc:
            messagebox.showerror("Database error", f"Could not create admin: {exc}")
        except Exception as exc:
            messagebox.showerror("Database error", f"Could not create admin: {exc}")

    def _on_close(self):
        self.is_scanning = False
        self.stop_event.set()
        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    create_desktop_shortcut()
    AdminCreatorApp().run()