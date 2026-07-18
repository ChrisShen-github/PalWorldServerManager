#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo "Run with sudo."; exit 1; fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_SOURCE="$SCRIPT_DIR/agent.py"
PATH_UNIT_TEMPLATE="$SCRIPT_DIR/palworld-host-agent.path"
escaped_agent_source=${AGENT_SOURCE//\\/\\\\}
escaped_agent_source=${escaped_agent_source//&/\\&}
escaped_agent_source=${escaped_agent_source//|/\\|}
rendered_path_unit=$(mktemp)
trap 'rm -f "$rendered_path_unit"' EXIT

install -d -m 0755 /opt/palworld-server-manager /run/palworld-server-manager
chmod 0755 "$AGENT_SOURCE"
ln -sfn "$AGENT_SOURCE" /opt/palworld-server-manager/agent.py
install -m 0644 "$SCRIPT_DIR/palworld-host-agent.service" /etc/systemd/system/palworld-host-agent.service
sed "s|__HOST_AGENT_SOURCE__|$escaped_agent_source|g" "$PATH_UNIT_TEMPLATE" \
  > "$rendered_path_unit"
install -m 0644 "$rendered_path_unit" /etc/systemd/system/palworld-host-agent.path
systemctl daemon-reload
systemctl enable palworld-host-agent.service
systemctl enable --now palworld-host-agent.path
systemctl restart palworld-host-agent.service
echo "Host agent installed from $AGENT_SOURCE. Future manager image updates will restart it automatically."
