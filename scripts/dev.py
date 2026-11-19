from __future__ import annotations

import os
import signal
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"


def run(command: list[str], *, cwd: Path) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def stop_processes(processes: list[subprocess.Popen]) -> None:
    for process in processes:
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass

    for process in processes:
        if process.poll() is None:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()


def main() -> int:
    compose_started = False
    processes: list[subprocess.Popen] = []
    try:
        compose_started = True
        run(["docker", "compose", "up", "-d", "--wait", "db"], cwd=ROOT)
        run(["uv", "run", "alembic", "upgrade", "head"], cwd=BACKEND)

        processes.append(
            subprocess.Popen(
                [
                    "uv",
                    "run",
                    "uvicorn",
                    "app.main:app",
                    "--reload",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8100",
                ],
                cwd=BACKEND,
                start_new_session=True,
            )
        )
        processes.append(
            subprocess.Popen(["bun", "run", "dev"], cwd=FRONTEND, start_new_session=True)
        )

        print("API: http://127.0.0.1:8100/docs", flush=True)
        print("Frontend: http://127.0.0.1:5173", flush=True)
        print("Presiona Ctrl+C para detener la aplicación y PostgreSQL.", flush=True)

        while True:
            for process in processes:
                exit_code = process.poll()
                if exit_code is not None:
                    return exit_code
            time.sleep(0.25)
    except KeyboardInterrupt:
        print("\nDeteniendo servidores…", flush=True)
        return 0
    finally:
        stop_processes(processes)
        if compose_started:
            subprocess.run(["docker", "compose", "down"], cwd=ROOT, check=False)


if __name__ == "__main__":
    raise SystemExit(main())
