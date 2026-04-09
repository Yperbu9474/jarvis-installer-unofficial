#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${JARVIS_INSTALLER_REPO_URL:-https://github.com/Yperbu9474/jarvis-installer-unofficial.git}"
INSTALL_DIR="${JARVIS_INSTALLER_DIR:-$HOME/.jarvis-installer-unofficial}"
MODE="${1:-native}"

echo "Jarvis Installer (unofficial)"
echo "Mode: ${MODE}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

if [ -d "${INSTALL_DIR}/.git" ]; then
  git -C "${INSTALL_DIR}" pull --ff-only
else
  git clone "${REPO_URL}" "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to run the installer control panel build" >&2
  exit 1
fi

npm install
npm run build
echo "Installer sources are ready in ${INSTALL_DIR}"
echo "For server-native install, run the upstream one-liner:"
echo "  curl -fsSL https://raw.githubusercontent.com/vierisid/jarvis/main/install.sh | bash"
echo "For packaged desktop builds, run:"
echo "  npm run dist"
