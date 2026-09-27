#!/usr/bin/env bash
# Runs the end-to-end suite on Linux, in WSL, from a copy of this working tree.
#
# Smart App Control blocks the unsigned Windows electron.exe on the development
# machine, so the suite cannot run on Windows there; the Linux build of
# Electron inside WSL is not subject to it. This is a fast local check, not a
# Windows one: CI (.github/workflows/verify.yml) remains the gate before a merge.
#
#   npm run test:e2e:wsl                               # the whole suite
#   npm run test:e2e:wsl -- e2e/appearance.test.ts     # one file
#   npm run test:e2e:wsl -- -t "name of one test"      # one test
#   npm run test:e2e:wsl -- --headed                   # watch it, through WSLg
#
# One-time setup of the Ubuntu-24.04 distro is described in the README.
set -euo pipefail

src="$(pwd)"
# On the Linux filesystem: a project on /mnt/c is slow in WSL and receives no
# file-watcher events, and its node_modules holds Windows binaries.
dest="$HOME/md-reader"

headed=0
args=()
for arg in "$@"; do
  if [ "$arg" = "--headed" ]; then headed=1; else args+=("$arg"); fi
done

# The working tree as it is, uncommitted changes included. Excluded folders
# are kept in the copy, not deleted, so its Linux node_modules survives.
mkdir -p "$dest"
rsync -a --delete \
  --exclude node_modules --exclude out --exclude dist --exclude artifacts --exclude .git \
  "$src/" "$dest/"
cd "$dest"

# Dependencies only when the lockfile changed since the last install.
stamp=node_modules/.installed-lockfile
if ! cmp -s package-lock.json "$stamp" 2>/dev/null; then
  echo "package-lock.json changed: installing the Linux dependencies..."
  npm ci --no-audit --no-fund
  cp package-lock.json "$stamp"
fi

# Electron fetches its binary the first time something asks where it is.
# Asked here, so the download is not charged to the first suite's launch.
node -e "require('electron')" >/dev/null

if [ "$headed" = 1 ]; then
  npx vitest run --project e2e "${args[@]}"
else
  # A virtual display, large enough for the app's 1200x820 window: nothing
  # appears on the desktop, and a run does not depend on which window has focus.
  xvfb-run -a --server-args="-screen 0 1920x1080x24" npx vitest run --project e2e "${args[@]}"
fi
