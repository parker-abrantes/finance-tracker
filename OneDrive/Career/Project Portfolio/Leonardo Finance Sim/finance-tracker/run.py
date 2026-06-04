#!/usr/bin/env python3
"""
Launch the Finance Tracker desktop app.

Usage:
    python run.py           # starts server on port 8000 and opens browser
    python run.py --port 9000
    python run.py --no-browser
"""
import argparse
import signal
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).parent
BACKEND = ROOT / "backend"


def wait_for_server(port: int, timeout: int = 15) -> bool:
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"http://localhost:{port}/programs", timeout=1)
            return True
        except Exception:
            time.sleep(0.3)
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Finance Tracker launcher")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    print(f"Starting Finance Tracker on http://localhost:{args.port} ...")

    proc = subprocess.Popen(
        [
            sys.executable, "-m", "uvicorn", "main:app",
            "--port", str(args.port),
            "--host", "127.0.0.1",
        ],
        cwd=BACKEND,
    )

    def _shutdown(sig, frame):
        print("\nShutting down...")
        proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    if wait_for_server(args.port):
        url = f"http://localhost:{args.port}"
        print(f"Ready — {url}")
        if not args.no_browser:
            webbrowser.open(url)
    else:
        print("Server did not start in time. Check for errors above.")

    proc.wait()


if __name__ == "__main__":
    main()
