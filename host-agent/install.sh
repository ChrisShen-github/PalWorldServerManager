#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo "Run with sudo."; exit 1; fi
install -d -m 0755 /opt/palworld-server-manager /run/palworld-server-manager
install -m 0755 host-agent/agent.py /opt/palworld-server-manager/agent.py
install -m 0644 host-agent/palworld-host-agent.service /etc/systemd/system/palworld-host-agent.service
systemctl daemon-reload
systemctl enable --now palworld-host-agent.service
echo "Host agent installed. Start the manager container next."
