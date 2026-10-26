#!/usr/bin/env python3
"""Discoverable, user-local CTF profile helpers for trusted team sessions."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys

TOOLS = {
    "Workspace": "bash tmux nano vim.tiny git jq rg batcat fdfind tree 7z unrar-free zstd sqlite3",
    "Web and networking": "curl wget nc socat nmap dig whois ssh openssl ffuf gobuster http",
    "Reversing and pwn": "gcc g++ make cmake gdb objdump readelf strings strace ltrace patchelf nasm checksec r2 ROPgadget ropper pwn",
    "Forensics and stego": "file exiftool binwalk foremost fls mmls pngcheck zbarimg steghide tshark tcpdump",
    "Crypto and hashes": "john hashid hashcat openssl xxd base64",
    "Python": "python3 pip pipx sqlmap",
}
MODULES = ["requests", "bs4", "Crypto", "z3", "capstone", "unicorn", "pwn", "sympy", "gmpy2", "PIL", "elftools", "scapy"]
PRESETS = {
    "web": ("pipx", ["httpie"]),
    "crypto": ("pip", ["sympy", "gmpy2"]),
    "forensics": ("pipx", ["oletools", "pdfid"]),
    "stego": ("pipx", ["stegcracker"]),
}
HOME = Path.home()
APT_ROOT = HOME / ".local/share/clite/apt"
SYSROOT = HOME / ".local/opt/sysroot"


def apt_command(action, packages):
    """Download signed Debian packages and extract a relocatable user prefix.

    Maintainer scripts are deliberately not run. Services/kernel/root-dependent
    packages require an image rebuild; this does not upgrade the base container.
    """
    if action not in {"update", "install", "upgrade"}:
        raise ValueError("Usage: clite system update|install PACKAGE...|upgrade")
    if any(not re.fullmatch(r"[a-z0-9][a-z0-9+.-]*(?::[a-z0-9]+)?", p) for p in packages):
        raise ValueError("Use Debian package names, not paths or flags")
    for directory in [APT_ROOT / "lists/partial", APT_ROOT / "archives/partial", SYSROOT]:
        directory.mkdir(parents=True, exist_ok=True)
    manifest = APT_ROOT / "packages.json"
    installed = json.loads(manifest.read_text()) if manifest.exists() else []
    # Container-wide cache cleanup hooks cannot write as ctf. Clear those hooks
    # in this user-owned invocation only, leaving repository verification intact.
    apt_config = APT_ROOT / "user.conf"
    apt_config.write_text("#clear APT::Update::Post-Invoke;\n#clear DPkg::Post-Invoke;\n", encoding="utf-8")
    settings = ["-c", str(apt_config), "-o", f"Dir::State::lists={APT_ROOT / 'lists'}", "-o", f"Dir::Cache::archives={APT_ROOT / 'archives'}",
                "-o", "Debug::NoLocking=true", "-o", "APT::Sandbox::User=" + os.environ.get("USER", "ctf")]
    if action in {"update", "upgrade"} or not any((APT_ROOT / "lists").glob("*Packages*")):
        run(["apt-get", *settings, "update"])
    if action == "update":
        return
    requested = sorted(set(installed + packages))
    if not requested:
        raise ValueError("Specify packages to install first")
    # --reinstall also downloads packages already present in the immutable base.
    run(["apt-get", *settings, "--download-only", "--reinstall", "--no-install-recommends", "--yes", "install", *requested])
    archives = sorted((APT_ROOT / "archives").glob("*.deb"))
    for archive in archives:
        run(["dpkg-deb", "--extract", str(archive), str(SYSROOT)])
    manifest.write_text(json.dumps(requested), encoding="utf-8")
    for archive in archives:
        archive.unlink()
    print(f"Installed into {SYSROOT}. Run source ~/.bashrc to refresh library paths.")
    print("Relocatable tools work directly. Packages requiring /usr paths, services or maintainer scripts need a Docker rebuild.")


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def inventory():
    return {group: {cmd: bool(shutil.which(cmd)) for cmd in commands.split()} for group, commands in TOOLS.items()}


def main():
    parser = argparse.ArgumentParser(description="CLite portable CTF profile")
    parser.add_argument("command", nargs="?", default="help", choices=["help", "tools", "doctor", "install", "init", "snapshot", "restore", "system"])
    parser.add_argument("value", nargs="?")
    parser.add_argument("packages", nargs="*")
    args = parser.parse_args()
    if args.command == "help":
        print("""clite tools             Available and optional tools, checked on this server
clite doctor            Check Python libraries, workspace and tool availability
clite install PRESET     Session-local packages: web, crypto, forensics, stego
clite init NAME          Create challenges/NAME/{files,output,solve.py,notes.md}
clite snapshot           Record local pip packages and pipx apps in HOME
clite restore            Reinstall a downloaded profile from HOME
clite system update      Refresh your own Debian package index
clite system install PKG Download/extract Debian tools into ~/.local/opt/sysroot
clite system upgrade     Refresh user-installed Debian tools (base OS is unchanged)

pip install PACKAGE      Add Python libraries to the active session venv
pipx install PACKAGE     Add a Python CLI to ~/.local/bin
pip install -U PACKAGE   Update a Python package
pipx upgrade-all         Update session-local CLI apps
Store portable binaries in ~/.local/bin; no sudo is required.
System dependencies belong in Dockerfile. Raw capture/GPU tools need a suitable host.
Use the browser's Download workspace button for a portable ZIP.
Run clite snapshot before download, then clite restore in a new team session.
Package restoration downloads and executes packages; restore your own trusted files.
""")
    elif args.command in ("tools", "doctor"):
        for group, tools in inventory().items():
            print(f"\n{group}")
            for name, available in tools.items():
                print(f"  {'ready   ' if available else 'optional'} {name}")
        if args.command == "doctor":
            print("\nPython libraries")
            for module in MODULES:
                print(f"  {'ready   ' if importlib.util.find_spec(module) else 'missing '} {module}")
            print(f"\nPython: {sys.executable}\nWorkspace: {HOME}\nPlatform: {platform.platform()}")
            print("Network capture, kernel debugging and GPU workloads depend on host capabilities.")
    elif args.command == "system":
        apt_command(args.value, args.packages)
    elif args.command == "install":
        if args.value not in PRESETS:
            parser.error("Choose a preset: " + ", ".join(PRESETS))
        kind, packages = PRESETS[args.value]
        for package in packages:
            run([sys.executable, "-m", "pip", "install", package] if kind == "pip" else ["pipx", "install", package])
        print("Installed into this session. Run clite snapshot before downloading your workspace.")
    elif args.command == "init":
        if not args.value or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", args.value):
            parser.error("Use a challenge name with letters, numbers, underscores or dashes")
        dest = HOME / "challenges" / args.value
        dest.mkdir(parents=True, exist_ok=False)
        for name in ["files", "output"]:
            (dest / name).mkdir()
        (dest / "notes.md").write_text(f"# {args.value}\n\n## Scope and category\n\n## Evidence\n\n## Approach\n\n## Flag\n", encoding="utf-8")
        (dest / "solve.py").write_text('#!/usr/bin/env python3\n"""Challenge notes and reproducible solution."""\nfrom pathlib import Path\n\nROOT = Path(__file__).parent\n', encoding="utf-8")
        print(dest)
    elif args.command == "snapshot":
        result = run([sys.executable, "-m", "pip", "freeze", "--local"], capture_output=True, text=True)
        (HOME / "requirements-session.txt").write_text(result.stdout, encoding="utf-8")
        result = run(["pipx", "list", "--json"], capture_output=True, text=True)
        apps = json.loads(result.stdout).get("venvs", {})
        specs = [info["metadata"]["main_package"]["package_or_url"] for info in apps.values()]
        manifest = APT_ROOT / "packages.json"
        system = json.loads(manifest.read_text()) if manifest.exists() else []
        (HOME / "clite-profile.json").write_text(json.dumps({"version": 1, "python": platform.python_version(), "pipx": specs, "system": system}, indent=2), encoding="utf-8")
        print("Saved requirements-session.txt and clite-profile.json. Download workspace to keep them.")
    elif args.command == "restore":
        profile = json.loads((HOME / "clite-profile.json").read_text(encoding="utf-8"))
        if profile.get("version") != 1:
            parser.error("Unsupported profile version")
        run([sys.executable, "-m", "pip", "install", "-r", str(HOME / "requirements-session.txt")])
        for spec in profile.get("pipx", []):
            if not isinstance(spec, str) or spec.startswith("-"):
                parser.error("Invalid pipx package in profile")
            run(["pipx", "install", spec])
        if profile.get("system"):
            apt_command("install", profile["system"])
        print("Profile restored into this session.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f"clite: {error}", file=sys.stderr)
        sys.exit(1)
