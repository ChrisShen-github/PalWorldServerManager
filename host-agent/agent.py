#!/usr/bin/env python3
"""Restricted native-host operations for Palworld Server Manager."""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from collections.abc import Callable
import urllib.request
from pathlib import Path

SOCKET = Path("/run/palworld-server-manager/agent.sock")
SERVICE = "palworld-server.service"
STEAMCMD_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz"
OPERATION_LOCK = asyncio.Lock()
ANSI_ESCAPE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")
OPTION_SETTINGS_RE = re.compile(r"^OptionSettings=\((.*)\)\s*$", re.MULTILINE)
CONFIG_DEFAULTS: dict[str, object] = {
    "server_name": "Default Palworld Server",
    "server_description": "",
    "server_player_max_num": 32,
    "rest_api_port": 8212,
    "backup_save_data": True,
    "exp_rate": 1.0,
    "pal_capture_rate": 1.0,
    "pal_spawn_num_rate": 1.0,
    "day_time_speed_rate": 1.0,
    "night_time_speed_rate": 1.0,
    "death_penalty": "All",
}
CONFIG_KEYS = {
    "server_name": "ServerName",
    "server_description": "ServerDescription",
    "server_password": "ServerPassword",
    "admin_password": "AdminPassword",
    "server_player_max_num": "ServerPlayerMaxNum",
    "rest_api_port": "RESTAPIPort",
    "backup_save_data": "bIsUseBackupSaveData",
    "exp_rate": "ExpRate",
    "pal_capture_rate": "PalCaptureRate",
    "pal_spawn_num_rate": "PalSpawnNumRate",
    "day_time_speed_rate": "DayTimeSpeedRate",
    "night_time_speed_rate": "NightTimeSpeedRate",
    "death_penalty": "DeathPenalty",
}


def checked_path(value: str) -> Path:
    path = Path(value).resolve()
    if not path.is_relative_to("/opt"):
        raise ValueError("安装目录必须位于 /opt 下")
    return path


def emit(output: Callable[[str], None] | None, message: str) -> None:
    if output:
        output(message)


def clean_terminal_output(value: str) -> str:
    return ANSI_ESCAPE.sub("", value).replace("\r", "")


def split_option_settings(value: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    depth = 0
    quoted = False
    escaped = False
    for character in value:
        if escaped:
            current.append(character)
            escaped = False
            continue
        if character == "\\" and quoted:
            current.append(character)
            escaped = True
            continue
        if character == '"':
            quoted = not quoted
        elif not quoted and character == "(":
            depth += 1
        elif not quoted and character == ")":
            depth = max(0, depth - 1)
        if character == "," and not quoted and depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            current.append(character)
    if current:
        parts.append("".join(current).strip())
    return [part for part in parts if part]


def option_map(content: str) -> tuple[re.Match[str], list[tuple[str, str]]]:
    match = OPTION_SETTINGS_RE.search(content)
    if not match:
        raise ValueError("配置文件中缺少 OptionSettings")
    entries: list[tuple[str, str]] = []
    for part in split_option_settings(match.group(1)):
        if "=" in part:
            key, value = part.split("=", 1)
            entries.append((key.strip(), value.strip()))
    return match, entries


def decode_string(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] == '"':
        return value[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    return value


def encode_string(value: str) -> str:
    if "\n" in value or "\r" in value:
        raise ValueError("配置文本不能包含换行")
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def config_file(server: Path) -> Path:
    return server / "Pal" / "Saved" / "Config" / "LinuxServer" / "PalWorldSettings.ini"


def default_config_file(server: Path) -> Path:
    return server / "DefaultPalWorldSettings.ini"


def config_source(server: Path) -> tuple[Path, bool]:
    target = config_file(server)
    if target.exists():
        return target, True
    default = default_config_file(server)
    if default.exists():
        return default, False
    raise FileNotFoundError("未找到 PalWorldSettings.ini 或 DefaultPalWorldSettings.ini，请先安装服务器")


def read_server_config(payload: dict[str, object]) -> dict[str, object]:
    server = checked_path(str(payload["server_path"]))
    source, exists = config_source(server)
    _, entries = option_map(source.read_text(encoding="utf-8-sig"))
    values = dict(entries)

    def number(key: str, default: float) -> float:
        try:
            return float(values.get(key, default))
        except ValueError:
            return default

    config = dict(CONFIG_DEFAULTS)
    config.update({
        "server_name": decode_string(values.get("ServerName", encode_string(str(CONFIG_DEFAULTS["server_name"])))),
        "server_description": decode_string(values.get("ServerDescription", '""')),
        "server_player_max_num": int(number("ServerPlayerMaxNum", 32)),
        "rest_api_port": int(number("RESTAPIPort", 8212)),
        "backup_save_data": values.get("bIsUseBackupSaveData", "True").lower() == "true",
        "exp_rate": number("ExpRate", 1.0),
        "pal_capture_rate": number("PalCaptureRate", 1.0),
        "pal_spawn_num_rate": number("PalSpawnNumRate", 1.0),
        "day_time_speed_rate": number("DayTimeSpeedRate", 1.0),
        "night_time_speed_rate": number("NightTimeSpeedRate", 1.0),
        "death_penalty": values.get("DeathPenalty", "All"),
        "server_password_set": bool(decode_string(values.get("ServerPassword", '""'))),
        "admin_password_set": bool(decode_string(values.get("AdminPassword", '""'))),
        "file_exists": exists,
    })
    return {"message": "已读取 PalWorldSettings.ini。" if exists else "已读取默认配置，保存后将创建 PalWorldSettings.ini。", "config": config}


def validated_config(raw: object) -> dict[str, object]:
    if not isinstance(raw, dict):
        raise ValueError("服务器配置格式无效")
    unknown = set(raw) - set(CONFIG_KEYS)
    if unknown:
        raise ValueError("包含不允许的配置项")
    result = dict(raw)
    for key, maximum in (("server_name", 128), ("server_description", 512), ("server_password", 128), ("admin_password", 128)):
        if key in result:
            if not isinstance(result[key], str) or len(result[key]) > maximum:
                raise ValueError(f"{key} 格式无效")
            if key == "server_name" and not result[key].strip():
                raise ValueError("服务器名称不能为空")
    integer_ranges = {"server_player_max_num": (1, 32), "rest_api_port": (1024, 65535)}
    for key, (minimum, maximum) in integer_ranges.items():
        value = result.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum:
            raise ValueError(f"{key} 必须在 {minimum} 到 {maximum} 之间")
    for key in ("exp_rate", "pal_capture_rate", "pal_spawn_num_rate", "day_time_speed_rate", "night_time_speed_rate"):
        value = result.get(key)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0.1 <= float(value) <= 20:
            raise ValueError(f"{key} 必须在 0.1 到 20 之间")
    if not isinstance(result.get("backup_save_data"), bool):
        raise ValueError("备份开关格式无效")
    if result.get("death_penalty") not in {"None", "Item", "ItemAndEquipment", "All"}:
        raise ValueError("死亡惩罚选项无效")
    return result


def encode_config_value(key: str, value: object) -> str:
    if key in {"server_name", "server_description", "server_password", "admin_password"}:
        return encode_string(str(value))
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def write_server_config(payload: dict[str, object]) -> dict[str, object]:
    server = checked_path(str(payload["server_path"]))
    source, _ = config_source(server)
    target = config_file(server)
    content = source.read_text(encoding="utf-8-sig")
    match, entries = option_map(content)
    config = validated_config(payload.get("config"))
    config["rest_api_enabled"] = True
    config_key_map = {**CONFIG_KEYS, "rest_api_enabled": "RESTAPIEnabled"}
    updates = {config_key_map[key]: encode_config_value(key, value) for key, value in config.items()}
    updated_entries: list[tuple[str, str]] = []
    seen: set[str] = set()
    for key, value in entries:
        updated_entries.append((key, updates.get(key, value)))
        seen.add(key)
    for key, value in updates.items():
        if key not in seen:
            updated_entries.append((key, value))
    rendered = content[:match.start()] + "OptionSettings=(" + ",".join(f"{key}={value}" for key, value in updated_entries) + ")" + content[match.end():]
    target.parent.mkdir(parents=True, exist_ok=True)
    backup_path: Path | None = None
    if target.exists():
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup_path = target.with_name(f"PalWorldSettings.ini.manager-{stamp}.bak")
        shutil.copy2(target, backup_path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=target.parent, prefix=".PalWorldSettings.", delete=False) as temporary:
        temporary.write(rendered)
        temporary_path = Path(temporary.name)
    os.chmod(temporary_path, 0o640)
    os.replace(temporary_path, target)
    run("chown", "palworld:palworld", str(target))
    return {
        "message": "服务器配置已保存；重启 Palworld 服务后生效。",
        "restart_required": True,
        "backup_created": str(backup_path) if backup_path else None,
    }


def run(*args: str, output: Callable[[str], None] | None = None) -> str:
    if output:
        process = subprocess.Popen(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1)
        lines: list[str] = []
        assert process.stdout is not None
        for line in process.stdout:
            text = clean_terminal_output(line).rstrip()
            if text:
                lines.append(text)
                output(text)
        if process.wait() != 0:
            raise subprocess.CalledProcessError(process.returncode, args, output="\n".join(lines))
        return "\n".join(lines[-4000:])
    result = subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return clean_terminal_output(result.stdout)[-4000:]


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


def operate(action: str, payload: dict[str, object], output: Callable[[str], None] | None = None) -> str | dict[str, object]:
    if action == "get_config": return read_server_config(payload)
    if action == "set_config": return write_server_config(payload)
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
        if action not in {"status", "install", "update", "start", "stop", "restart", "get_config", "set_config"}:
            raise ValueError("不允许的操作")
        streaming = bool(payload.get("stream"))
        async with OPERATION_LOCK:
            if streaming:
                await stream_operation(action, payload, writer)
            else:
                result = await asyncio.to_thread(operate, action, payload)
                response = {"ok": True, **result} if isinstance(result, dict) else {"ok": True, "message": result}
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
