#!/usr/bin/env bash
set -euo pipefail
plugin_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
node_exe="${FLUXBAR_WINDOWS_NODE:-}"
if [[ -z "$node_exe" ]]; then
  node_exe="$(command -v node.exe || true)"
fi
if [[ -z "$node_exe" && -x /mnt/c/nvm4w/nodejs/node.exe ]]; then node_exe=/mnt/c/nvm4w/nodejs/node.exe; fi
if [[ -z "$node_exe" ]]; then echo 'Set FLUXBAR_WINDOWS_NODE to your Windows node.exe path.' >&2; exit 1; fi
server_path="$(wslpath -w "$plugin_dir/scripts/server.mjs")"
cd /mnt/c/Windows/System32
exec "$node_exe" "$server_path"
