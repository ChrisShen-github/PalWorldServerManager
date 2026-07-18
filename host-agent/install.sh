#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo "Run with sudo."; exit 1; fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
install -d -m 0755 /opt/palworld-server-manager /run/palworld-server-manager
install -m 0755 "$SCRIPT_DIR/agent.py" /opt/palworld-server-manager/agent.py
install -m 0644 "$SCRIPT_DIR/palworld-host-agent.service" /etc/systemd/system/palworld-host-agent.service
systemctl daemon-reload
systemctl enable --now palworld-host-agent.service
echo "Host agent installed. Start the manager container next."
