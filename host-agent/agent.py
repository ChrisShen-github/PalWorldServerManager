#!/usr/bin/env python3
"""Restricted native-host operations for Palworld Server Manager."""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

SOCKET = Path("/run/palworld-server-manager/agent.sock")
SERVICE = "palworld-server.service"
STEAMCMD_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz"


def checked_path(value: str) -> Path:
    path = Path(value).resolve()
    if not path.is_relative_to("/opt"):
        raise ValueError("安装目录必须位于 /opt 下")
    return path


def run(*args: str) -> str:
    result = subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return result.stdout[-4000:]


def ensure_user() -> None:
    if subprocess.run(("id", "palworld"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        run("useradd", "--system", "--create-home", "--home-dir", "/var/lib/palworld", "--shell", "/usr/sbin/nologin", "palworld")


def install_steamcmd(path: Path) -> str:
    if (path / "steamcmd.sh").exists():
        return "SteamCMD 已存在。"
    run("apt-get", "update")
    run("apt-get", "install", "-y", "lib32gcc-s1", "libc6-i386", "curl")
    path.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".tar.gz") as archive:
        urllib.request.urlretrieve(STEAMCMD_URL, archive.name)
        with tarfile.open(archive.name) as bundle:
            bundle.extractall(path)
    run("chown", "-R", "palworld:palworld", str(path))
    return "SteamCMD 已安装。"


def write_service(server: Path) -> None:
    content = f"""[Unit]\nDescription=Palworld Dedicated Server\nAfter=network.target\n\n[Service]\nUser=palworld\nWorkingDirectory={server}\nExecStart={server}/PalServer.sh -port=8211 -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS\nRestart=on-failure\nRestartSec=10\n\n[Install]\nWantedBy=multi-user.target\n"""
    Path("/etc/systemd/system/palworld-server.service").write_text(content)
    run("systemctl", "daemon-reload")


def install(payload: dict[str, str]) -> str:
    steamcmd, server = checked_path(payload["steamcmd_path"]), checked_path(payload["server_path"])
    ensure_user()
    message = install_steamcmd(steamcmd)
    server.mkdir(parents=True, exist_ok=True)
    run("chown", "-R", "palworld:palworld", str(server))
    message += "\n" + run("runuser", "-u", "palworld", "--", str(steamcmd / "steamcmd.sh"), "+force_install_dir", str(server), "+login", "anonymous", "+app_update", "2394010", "validate", "+quit")
    write_service(server)
    return message + "\n安装完成；请在面板中配置服务器设置后启动。"


def status(_: dict[str, str]) -> str:
    return run("systemctl", "is-active", SERVICE) if shutil.which("systemctl") else "systemd 不可用"


def operate(action: str, payload: dict[str, str]) -> str:
    if action == "install": return install(payload)
    if action == "update":
        steamcmd, server = checked_path(payload["steamcmd_path"]), checked_path(payload["server_path"])
        run("systemctl", "stop", SERVICE)
        return run("runuser", "-u", "palworld", "--", str(steamcmd / "steamcmd.sh"), "+force_install_dir", str(server), "+login", "anonymous", "+app_update", "2394010", "validate", "+quit")
    return run("systemctl", action, SERVICE)


async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        payload = json.loads((await reader.readline()).decode())
        action = payload.get("action")
        if action not in {"status", "install", "update", "start", "stop", "restart"}:
            raise ValueError("不允许的操作")
        response = {"ok": True, "message": await asyncio.to_thread(operate, action, payload)}
    except Exception as error:  # Agent must return errors without exposing a shell.
        response = {"ok": False, "message": f"{error.__class__.__name__}: {error}"}
    writer.write((json.dumps(response) + "\n").encode())
    await writer.drain(); writer.close(); await writer.wait_closed()


async def main() -> None:
    SOCKET.parent.mkdir(parents=True, exist_ok=True)
    if SOCKET.exists(): SOCKET.unlink()
    server = await asyncio.start_unix_server(handle, path=str(SOCKET))
    os.chmod(SOCKET, 0o660)
    async with server: await server.serve_forever()


if __name__ == "__main__":
    try: asyncio.run(main())
    except KeyboardInterrupt: sys.exit(0)
