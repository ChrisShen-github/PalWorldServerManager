#!/bin/sh
# Compatible wrapper for Pocketpair's official palserver image. The bind mount
# keeps generated settings, saves, logs, and rolling backups on the Ubuntu host.
set -eu

saved_path=/pal/Package/Pal/Saved
mkdir -p "$saved_path"

if command -v sudo >/dev/null 2>&1; then
  sudo chown -R user:usergroup "$saved_path"
fi

exec /bin/sh /pal/Package/PalServer.sh "$@"
