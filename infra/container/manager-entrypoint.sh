#!/usr/bin/env sh
set -eu

host_agent_dir=/opt/palworld-server-manager/host-agent
bundled_agent_dir=/usr/share/palworld-server-manager/host-agent

sync_file() {
  source_file=$1
  destination_file=$2
  file_mode=$3
  if [ ! -f "$destination_file" ] || ! cmp -s "$source_file" "$destination_file"; then
    install -D -m "$file_mode" "$source_file" "${destination_file}.tmp"
    mv "${destination_file}.tmp" "$destination_file"
  fi
}

# Keep a usable installer beside compose.yaml. The host systemd service follows
# this mounted agent file, and its path unit restarts the service after updates.
mkdir -p "$host_agent_dir"
sync_file "$bundled_agent_dir/agent.py" "$host_agent_dir/agent.py" 0755
sync_file "$bundled_agent_dir/install.sh" "$host_agent_dir/install.sh" 0755
sync_file "$bundled_agent_dir/palworld-host-agent.service" "$host_agent_dir/palworld-host-agent.service" 0644
sync_file "$bundled_agent_dir/palworld-host-agent.path" "$host_agent_dir/palworld-host-agent.path" 0644

exec "$@"
