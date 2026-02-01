#!/usr/bin/env bash
set -e

# ugig CLI installer
# Usage: curl -fsSL https://ugig.net/install.sh | bash

REPO="https://github.com/profullstack/ugig.net.git"
INSTALL_DIR="${UGIG_INSTALL_DIR:-$HOME/.ugig-cli}"

echo "Installing ugig CLI..."

# Check for node
if ! command -v node &> /dev/null; then
  echo "Error: Node.js 18+ is required. Install it from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18+ required (found v$(node -v))"
  exit 1
fi

# Check for npm or pnpm
if command -v pnpm &> /dev/null; then
  PKG_MGR="pnpm"
elif command -v npm &> /dev/null; then
  PKG_MGR="npm"
else
  echo "Error: npm or pnpm is required"
  exit 1
fi

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --quiet
else
  echo "Cloning repository..."
  git clone --quiet --depth 1 "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR/cli"

# Install and build
echo "Installing dependencies..."
$PKG_MGR install --silent 2>/dev/null || $PKG_MGR install
echo "Building..."
$PKG_MGR run build

# Create symlink
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/cli/dist/index.js" "$BIN_DIR/ugig"
chmod +x "$INSTALL_DIR/cli/dist/index.js"

echo ""
echo "ugig CLI installed successfully!"
echo ""

# Check if BIN_DIR is in PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "Add this to your shell profile (~/.bashrc or ~/.zshrc):"
  echo ""
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo ""
fi

echo "Get started:"
echo "  ugig config set api_key <your-api-key>"
echo "  ugig gigs list"
echo ""
