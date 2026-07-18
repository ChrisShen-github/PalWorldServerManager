#!/usr/bin/env sh
set -eu

host_agent_dir=/opt/palworld-server-manager/host-agent
bundled_agent_dir=/usr/share/palworld-server-manager/host-agent

# A bind mount starts empty on a first-time deployment. Seed it once so the
# installer is available beside compose.yaml without extracting from the image.
if [ ! -f "$host_agent_dir/install.sh" ]; then
  mkdir -p "$host_agent_dir"
  cp -a "$bundled_agent_dir/." "$host_agent_dir/"
fi

exec "$@"
