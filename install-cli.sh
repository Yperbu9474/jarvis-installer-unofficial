#!/usr/bin/env bash
set -e

REPO="Yperbu9474/jarvis-installer-unofficial"
INSTALL_DIR="$HOME/.jarv"

echo ""
echo "  ╭─────────────────────────────────╮"
echo "  │   Installing jarv CLI…          │"
echo "  ╰─────────────────────────────────╯"
echo ""

# ── Check / install Node.js ──────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "Node.js not found. Installing Node.js 20…"
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v brew &>/dev/null; then
    brew install node@20
  else
    echo "Error: Cannot auto-install Node.js. Please install Node.js 18+ manually."
    echo "  https://nodejs.org/en/download/"
    exit 1
  fi
fi

NODE_VERSION=$(node -e "process.stdout.write(process.version)")
echo "✓ Node.js $NODE_VERSION"

# ── Check git ────────────────────────────────────────────────────────────────
if ! command -v git &>/dev/null; then
  echo "Error: git is required but not installed."
  echo "  sudo apt-get install -y git"
  exit 1
fi

# ── Clone or update repo ─────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing installation at $INSTALL_DIR…"
  cd "$INSTALL_DIR"
  git pull --ff-only
else
  echo "Cloning jarvis-installer…"
  rm -rf "$INSTALL_DIR"
  git clone "https://github.com/$REPO.git" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# ── Install npm dependencies ─────────────────────────────────────────────────
echo "Installing dependencies…"
npm install --ignore-scripts 2>/dev/null || true

# ── Build CLI ────────────────────────────────────────────────────────────────
echo "Building jarv CLI…"
npx tsc -p tsconfig.cli.json

# ── Create launcher script ───────────────────────────────────────────────────
ENTRY="$INSTALL_DIR/dist-cli/jarv.js"
if [ ! -f "$ENTRY" ]; then
  echo "Error: Build failed — $ENTRY not found."
  exit 1
fi

# ── Install binary to PATH ──────────────────────────────────────────────────
BIN_DIR="/usr/local/bin"
if [ -w "$BIN_DIR" ]; then
  ln -sf "$ENTRY" "$BIN_DIR/jarv"
  chmod +x "$BIN_DIR/jarv"
else
  sudo ln -sf "$ENTRY" "$BIN_DIR/jarv"
  sudo chmod +x "$BIN_DIR/jarv"
fi

# ── Success ──────────────────────────────────────────────────────────────────
echo ""
echo "✓ jarv installed successfully!"
echo ""
echo "  Try:                   jarv help"
echo "  Install Jarvis:        jarv install"
echo "  Setup reverse proxy:   jarv proxy"
echo ""
