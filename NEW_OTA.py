import os, sys, json, shutil, subprocess, re, base64
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

def load_env():
    vals = {}
    if not ENV_FILE.exists(): print("ERROR: .env missing!"); sys.exit(1)
    for line in ENV_FILE.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip().strip("'\"")
    return vals

def build():
    print("\nBuilding...")
    secrets = load_env()
    env = os.environ.copy()
    env.update({
        "TAURI_SIGNING_PRIVATE_KEY": secrets["TAURI_SIGNING_PRIVATE_KEY"],
        "TAURI_SIGNING_PRIVATE_KEY_PASSWORD": secrets["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]
    })
    r = subprocess.run(["npm", "run", "tauri", "build"], cwd=WORKSPACE, env=env)
    if r.returncode != 0: sys.exit(1)

def find_deb(ver):
    debs = sorted(BUNDLE_DIR.glob("*.deb"), key=lambda x: x.stat().st_mtime, reverse=True)
    if not debs: print("ERROR: No .deb found!"); sys.exit(1)
    return debs[0]

def get_clean_sig_content(sig_path):
    raw = sig_path.read_text().strip()
    if len(raw.splitlines()) == 1 and len(raw) > 100:
        try:
            raw = base64.b64decode(raw).decode('utf-8').strip()
        except:
            pass
    return raw

def verify_signature(deb, pubkey):
    print(f"  + Verifying {deb.name}...")
    content = get_clean_sig_content(Path(str(deb) + ".sig"))
    lines = [l for l in content.splitlines() if l.strip()]
    
    if len(lines) < 4:
        print(f"ERROR: Malformed signature (found {len(lines)} lines).")
        sys.exit(1)

    sanitized = ["untrusted comment: signature", lines[1], lines[2], lines[3]]
    tmp_sig = WORKSPACE / "temp_verify.sig"
    tmp_sig.write_text("\n".join(sanitized) + "\n")
    
    try:
        r = subprocess.run(
            ["minisign", "-Vm", str(deb), "-x", str(tmp_sig), "-P", pubkey],
            capture_output=True, text=True
        )
        if r.returncode != 0:
            print(f"ERROR: Verification failed!\n{r.stderr}")
            sys.exit(1)
        print("  + Local Verification: SUCCESS")
    finally:
        if tmp_sig.exists(): tmp_sig.unlink()

def main():
    print("="*45 + "\n   Coinadrink OTA Deployment Tool\n" + "="*45)
    cur = read_version()
    new = bump(cur)
    print(f"\nVersion: {cur} → {new}")

    notes = input("Release notes: ").strip() or f"Version {new} release."
    if input(f"Build v{new}? [y/N] ").lower() != 'y': sys.exit(0)

    # Update files
    c = json.loads(TAURI_CONF.read_text()); c["version"] = new
    TAURI_CONF.write_text(json.dumps(c, indent=2))
    t = re.sub(r'^(version\s*=\s*")[^"]+(")', rf'\g<1>{new}\g<2>', CARGO_TOML.read_text(), count=1, flags=re.MULTILINE)
    CARGO_TOML.write_text(t)

    build()
    deb = find_deb(new)
    
    sig_path = Path(str(deb) + ".sig")
    if not sig_path.exists():
        print("  ! Signing now...")
        secrets = load_env()
        env = os.environ.copy()
        env.update({"TAURI_SIGNING_PRIVATE_KEY": secrets["TAURI_SIGNING_PRIVATE_KEY"], "TAURI_SIGNING_PRIVATE_KEY_PASSWORD": secrets["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]})
        subprocess.run(["npx", "tauri", "signer", "sign", str(deb)], cwd=WORKSPACE, env=env)

    sig_content = get_clean_sig_content(sig_path)
    verify_signature(deb, load_env()["TAURI_SIGNING_PUBLIC_KEY"])

    arch_key = "linux-x86_64" if "amd64" in deb.name else "linux-aarch64"
    OTA_DIR.mkdir(exist_ok=True)
    shutil.move(str(deb), str(OTA_DIR / deb.name))
    (OTA_DIR / f"{deb.name}.sig").write_text(sig_content)

    sig_lines = [l for l in sig_content.splitlines() if l.strip()]
    if len(sig_lines) >= 2:
        json_signature = sig_lines[1]
    else:
        json_signature = sig_content

    data = {
        "version": f"v{new}",
        "notes": notes,
        "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {
            arch_key: {
                "signature": json_signature,
                "url": f"{GITHUB_RAW_BASE}/{deb.name}"
            }
        }
    }
    
    UPDATES_JSON.write_text(json.dumps(data, indent=2))
    print(f"\nSUCCESS: v{new} ready in OTA/ folder.")

if __name__ == "__main__":
    main()