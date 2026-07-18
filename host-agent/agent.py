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
from collections.abc import Callable
import urllib.request
from pathlib import Path

SOCKET = Path("/run/palworld-server-manager/agent.sock")
SERVICE = "palworld-server.service"
STEAMCMD_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz"
OPERATION_LOCK = asyncio.Lock()


def checked_path(value: str) -> Path:
    path = Path(value).resolve()
    if not path.is_relative_to("/opt"):
        raise ValueError("安装目录必须位于 /opt 下")
    return path


def emit(output: Callable[[str], None] | None, message: str) -> None:
    if output:
        output(message)


def run(*args: str, output: Callable[[str], None] | None = None) -> str:
    if output:
        process = subprocess.Popen(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1)
        lines: list[str] = []
        assert process.stdout is not None
        for line in process.stdout:
            text = line.rstrip()
            if text:
                lines.append(text)
                output(text)
        if process.wait() != 0:
            raise subprocess.CalledProcessError(process.returncode, args, output="\n".join(lines))
        return "\n".join(lines[-4000:])
    result = subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return result.stdout[-4000:]


def ensure_user(output: Callable[[str], None] | None = None) -> None:
    if subprocess.run(("id", "palworld"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        emit(output, "正在创建 palworld 系统用户…")
        run("useradd", "--system", "--create-home", "--home-dir", "/var/lib/palworld", "--shell", "/usr/sbin/nologin", "palworld", output=output)


def install_steamcmd(path: Path, output: Callable[[str], None] | None = None) -> str:
    emit(output, "正在检查 SteamCMD…")
    if (path / "steamcmd.sh").exists():
        emit(output, "SteamCMD 已存在，跳过下载。")
        return "SteamCMD 已存在。"
    emit(output, "正在安装 SteamCMD 所需系统依赖…")
    run("apt-get", "update", output=output)
    run("apt-get", "install", "-y", "lib32gcc-s1", "libc6-i386", "curl", output=output)
    path.mkdir(parents=True, exist_ok=True)
    emit(output, "正在下载并解压 SteamCMD…")
    with tempfile.NamedTemporaryFile(suffix=".tar.gz") as archive:
        last_percent = -1

        def progress(blocks: int, block_size: int, total_size: int) -> None:
            nonlocal last_percent
            if total_size <= 0:
                return
            percent = min(100, blocks * block_size * 100 // total_size)
            if percent >= last_percent + 10 or percent == 100:
                last_percent = percent
                emit(output, f"正在下载 SteamCMD… {percent}%")

        urllib.request.urlretrieve(STEAMCMD_URL, archive.name, reporthook=progress)
        with tarfile.open(archive.name) as bundle:
            bundle.extractall(path)
    run("chown", "-R", "palworld:palworld", str(path), output=output)
    emit(output, "SteamCMD 安装完成。")
    return "SteamCMD 已安装。"


def write_service(server: Path, output: Callable[[str], None] | None = None) -> None:
    content = f"""[Unit]\nDescription=Palworld Dedicated Server\nAfter=network.target\n\n[Service]\nUser=palworld\nWorkingDirectory={server}\nExecStart={server}/PalServer.sh -port=8211 -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS\nRestart=on-failure\nRestartSec=10\n\n[Install]\nWantedBy=multi-user.target\n"""
    Path("/etc/systemd/system/palworld-server.service").write_text(content)
    emit(output, "正在创建 Palworld systemd 服务…")
    run("systemctl", "daemon-reload", output=output)


def install(payload: dict[str, str], output: Callable[[str], None] | None = None) -> str:
    steamcmd, server = checked_path(payload["steamcmd_path"]), checked_path(payload["server_path"])
    emit(output, "正在验证安装目录…")
    ensure_user(output)
    message = install_steamcmd(steamcmd, output)
    server.mkdir(parents=True, exist_ok=True)
    run("chown", "-R", "palworld:palworld", str(server), output=output)
    emit(output, "正在通过 SteamCMD 下载并验证 PalServer（App 2394010）…")
    message += "\n" + run("runuser", "-u", "palworld", "--", str(steamcmd / "steamcmd.sh"), "+force_install_dir", str(server), "+login", "anonymous", "+app_update", "2394010", "validate", "+quit", output=output)
    write_service(server, output)
    emit(output, "安装完成。请在面板中配置世界规则后启动服务器。")
    return message + "\n安装完成；请在面板中配置服务器设置后启动。"


def status(_: dict[str, str]) -> str:
    if not shutil.which("systemctl"):
        return "systemd 不可用"
    load_state = subprocess.run(("systemctl", "show", SERVICE, "--property=LoadState", "--value"), check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if load_state.stdout.strip() in {"not-found", ""}:
        return "not-installed"
    result = subprocess.run(("systemctl", "is-active", SERVICE), check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return result.stdout.strip() or "unknown"


def operate(action: str, payload: dict[str, str], output: Callable[[str], None] | None = None) -> str:
    if action == "install": return install(payload, output)
    if action == "update":
        steamcmd, server = checked_path(payload["steamcmd_path"]), checked_path(payload["server_path"])
        emit(output, "正在停止服务器…")
        run("systemctl", "stop", SERVICE, output=output)
        emit(output, "正在通过 SteamCMD 更新并验证 PalServer…")
        result = run("runuser", "-u", "palworld", "--", str(steamcmd / "steamcmd.sh"), "+force_install_dir", str(server), "+login", "anonymous", "+app_update", "2394010", "validate", "+quit", output=output)
        emit(output, "正在重新启动服务器…")
        run("systemctl", "start", SERVICE, output=output)
        emit(output, "更新完成；服务器已重新启动。")
        return result + "\n更新完成；服务器已重新启动。"
    emit(output, f"正在执行服务器{action}操作…")
    return run("systemctl", action, SERVICE, output=output)


async def write_event(writer: asyncio.StreamWriter, event: dict[str, object]) -> None:
    writer.write((json.dumps(event, ensure_ascii=False) + "\n").encode())
    await writer.drain()


async def stream_operation(action: str, payload: dict[str, str], writer: asyncio.StreamWriter) -> None:
    queue: asyncio.Queue[str] = asyncio.Queue()
    loop = asyncio.get_running_loop()
    task = asyncio.create_task(asyncio.to_thread(operate, action, payload, lambda message: loop.call_soon_threadsafe(queue.put_nowait, message)))
    while not task.done() or not queue.empty():
        try:
            message = await asyncio.wait_for(queue.get(), timeout=0.25)
        except asyncio.TimeoutError:
            continue
        await write_event(writer, {"event": "progress", "message": message})
    try:
        result = await task
        await write_event(writer, {"event": "complete", "ok": True, "message": result or "操作完成。"})
    except Exception as error:
        await write_event(writer, {"event": "complete", "ok": False, "message": f"{error.__class__.__name__}: {error}"})


async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    streaming = False
    try:
        payload = json.loads((await reader.readline()).decode())
        action = payload.get("action")
        if action not in {"status", "install", "update", "start", "stop", "restart"}:
            raise ValueError("不允许的操作")
        streaming = bool(payload.get("stream"))
        async with OPERATION_LOCK:
            if streaming:
                await stream_operation(action, payload, writer)
            else:
                response = {"ok": True, "message": await asyncio.to_thread(operate, action, payload)}
    except Exception as error:  # Agent must return errors without exposing a shell.
        if streaming:
            await write_event(writer, {"event": "complete", "ok": False, "message": f"{error.__class__.__name__}: {error}"})
        else:
            response = {"ok": False, "message": f"{error.__class__.__name__}: {error}"}
    if not streaming:
        writer.write((json.dumps(response) + "\n").encode())
        await writer.drain()
    writer.close()
    await writer.wait_closed()


async def main() -> None:
    SOCKET.parent.mkdir(parents=True, exist_ok=True)
    if SOCKET.exists(): SOCKET.unlink()
    server = await asyncio.start_unix_server(handle, path=str(SOCKET))
    os.chmod(SOCKET, 0o660)
    async with server: await server.serve_forever()


if __name__ == "__main__":
    try: asyncio.run(main())
    except KeyboardInterrupt: sys.exit(0)
