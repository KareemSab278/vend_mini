import os, sys, json, shutil, subprocess, re
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE       = Path(__file__).parent.resolve()
TAURI_CONF      = WORKSPACE /"src-tauri"/"tauri.conf.json"
CARGO_TOML      = WORKSPACE /"src-tauri"/"Cargo.toml"
UPDATES_JSON    = WORKSPACE /"updates.json"
OTA_DIR         = WORKSPACE /"OTA"
ENV_FILE        = WORKSPACE /".env"
BUNDLE_DIR      = WORKSPACE /"src-tauri"/"target"/"release"/"bundle"/"deb"
GITHUB_RAW_BASE = "https://raw.githubusercontent.com/KareemSab278/ordering_system/main/OTA"
KEY_FILE        = WORKSPACE / "tauri-signing.key"
KEY_FILE_PUB    = WORKSPACE / "tauri-signing.key.pub"


def bump(v):
    p = v.lstrip("v").split(".")
    p[2] = str(int(p[2]) + 1)
    return ".".join(p)


def read_version():
    return json.loads(TAURI_CONF.read_text())["version"]


def update_tauri_conf(ver):
    c = json.loads(TAURI_CONF.read_text())
    c["version"] = ver
    TAURI_CONF.write_text(json.dumps(c, indent=2))
    print(f"  + tauri.conf.json → {ver}")


def update_cargo_toml(ver):
    t = CARGO_TOML.read_text()
    t = re.sub(r'^(version\s*=\s*")[^"]+(")', rf'\g<1>{ver}\g<2>', t, count=1, flags=re.MULTILINE)
    CARGO_TOML.write_text(t)
    print(f"  + Cargo.toml      → {ver}")


def load_env():
    vals = {}
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, val = line.partition("=")
        vals[key.strip()] = val.strip().strip("'\"")
    return vals


def ensure_signing_key():
    if KEY_FILE.exists():
        return
    print("\n  ! tauri-signing.key not found — generating fresh keypair...")
    secrets = load_env()
    password = secrets["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]
    r = subprocess.run(
        ["npx", "tauri", "signer", "generate", "-w", str(KEY_FILE), "--password", password],
        cwd=WORKSPACE, capture_output=True, text=True
    )
    if r.returncode != 0:
        print(f"ERROR: Failed to generate keypair:\n{r.stderr}")
        sys.exit(1)
    print("  + Keypair generated")

    import base64
    new_private_key = KEY_FILE.read_text().replace("\n", "")
    pub_decoded = base64.b64decode(KEY_FILE_PUB.read_bytes()).decode()
    new_pubkey = pub_decoded.splitlines()[1].strip()

    env_text = ENV_FILE.read_text()
    env_text = re.sub(
        r"^TAURI_SIGNING_PRIVATE_KEY\s*=.*$",
        f"TAURI_SIGNING_PRIVATE_KEY = '{new_private_key}'",
        env_text, flags=re.MULTILINE
    )
    ENV_FILE.write_text(env_text)
    print("  + .env TAURI_SIGNING_PRIVATE_KEY updated")

    conf = json.loads(TAURI_CONF.read_text())
    conf["plugins"]["updater"]["pubkey"] = new_pubkey
    TAURI_CONF.write_text(json.dumps(conf, indent=2))
    print("  + tauri.conf.json pubkey updated")


def build():
    print("\nBuilding (this takes a few minutes)...")
    secrets = load_env()
    env = os.environ.copy()
    env["TAURI_SIGNING_PRIVATE_KEY"] = secrets["TAURI_SIGNING_PRIVATE_KEY"]
    env["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"] = secrets["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]
    r = subprocess.run(["npm", "run", "tauri", "build"], cwd=WORKSPACE, env=env)
    if r.returncode != 0:
        print("ERROR: Build failed."); sys.exit(1)
    print("  + Build succeeded")


def find_deb(ver):
    p = BUNDLE_DIR / f"ordering_system_{ver}_arm64.deb"
    if p.exists(): return p
    debs = sorted(BUNDLE_DIR.glob("*.deb"), key=lambda x: x.stat().st_mtime, reverse=True)
    if not debs: print(f"ERROR: No .deb in {BUNDLE_DIR}"); sys.exit(1)
    return debs[0]


def _generate_sig(deb):
    secrets = load_env()
    private_key = secrets["TAURI_SIGNING_PRIVATE_KEY"]
    password = secrets["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]
    env = os.environ.copy()
    env["TAURI_SIGNING_PRIVATE_KEY"] = private_key
    env["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"] = password
    r = subprocess.run(
        ["npx", "tauri", "signer", "sign", str(deb)],
        cwd=WORKSPACE, env=env, capture_output=True, text=True
    )
    if r.returncode != 0:
        print(f"ERROR: Failed to generate signature:\n{r.stderr}")
        sys.exit(1)
    sig_path = Path(str(deb) + ".sig")
    if not sig_path.exists():
        print(f"ERROR: Signature still not found after signing attempt.\nstdout: {r.stdout}\nstderr: {r.stderr}")
        sys.exit(1)
    print(f"  + Signature generated at {sig_path.name}")


def read_sig(deb):
    s = Path(str(deb) + ".sig")
    if not s.exists():
        print(f"  ! No signature found, generating one...")
        _generate_sig(deb)
    return s.read_text().strip()


def main():
    print("="*45 + "\n   Coinadrink OTA Deployment Tool\n" + "="*45)
    cur = read_version()
    new = bump(cur)
    print(f"\nVersion:  {cur} → {new}")

    notes = input("Release notes (Enter for default): ").strip() or f"Version {new} release."
    confirm = input(f"\nBuild + deploy v{new}? [y/N] ").strip().lower()
    if confirm != "y": print("Aborted."); sys.exit(0)

    print("\nUpdating version files...")
    update_tauri_conf(new)
    update_cargo_toml(new)

    ensure_signing_key()
    build()

    deb = find_deb(new)
    sig = read_sig(deb)

    OTA_DIR.mkdir(exist_ok=True)
    shutil.copy2(deb, OTA_DIR / deb.name)
    sig_path = Path(str(deb) + ".sig")
    if sig_path.exists():
        shutil.copy2(sig_path, OTA_DIR / (deb.name + ".sig"))
        print(f"\nCopied {deb.name} and {deb.name}.sig → OTA/")
    else:
        print(f"\nCopied {deb.name} → OTA/ (no .sig found)")

    data = {
        "version": f"v{new}",
        "notes": notes,
        "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {
            "linux-aarch64": {
                "signature": sig,
                "url": f"{GITHUB_RAW_BASE}/{deb.name}"
            }
        }
    }
    UPDATES_JSON.write_text(json.dumps(data, indent=2))
    print("+ updates.json updated")

    print(f"""
    Build complete: v{new}
    .deb      : OTA/{deb.name}
    .deb.sig  : OTA/{deb.name}.sig
    JSON      : updates.json

    Next steps:
    1. Push OTA/{deb.name}, OTA/{deb.name}.sig, and updates.json to GitHub.
    2. Make sure the URLs in updates.json match the files on GitHub.
    """)


if __name__ == "__main__":
    main()
