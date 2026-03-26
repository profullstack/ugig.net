#!/usr/bin/env bash
# server-setup.sh — Idempotent setup for ugig.net security scanning dependencies.
#
# Installs:
#   1. SpiderShield (Python) — MCP server security & description quality scanner
#   2. mcp-scan (Node) — MCP config security scanner (secrets, typosquatting, misconfigs)
#
# Safe to re-run; skips already-installed tools.
#
# Usage:
#   bash scripts/server-setup.sh

set -euo pipefail

echo "🔧 ugig.net server setup"
echo ""

# ── SpiderShield (Python) ──────────────────────────────────────────

if command -v spidershield &>/dev/null; then
  CURRENT_VER=$(spidershield --version 2>/dev/null || echo "unknown")
  echo "✅ spidershield already installed ($CURRENT_VER)"
else
  echo "📦 Installing spidershield..."
  if command -v pip3 &>/dev/null; then
    pip3 install --break-system-packages spidershield 2>/dev/null \
      || pip3 install --user spidershield 2>/dev/null \
      || pip3 install spidershield
    echo "✅ spidershield installed"
  else
    echo "⚠️  pip3 not found — skipping spidershield install"
    echo "   Install manually: pip3 install spidershield"
  fi
fi

# Verify spidershield is on PATH
if command -v spidershield &>/dev/null; then
  echo "   $(spidershield --version 2>/dev/null || echo 'version unknown')"
else
  # Check ~/.local/bin (pip --user installs here)
  if [ -x "$HOME/.local/bin/spidershield" ]; then
    echo "   ℹ️  spidershield installed at ~/.local/bin/spidershield"
    echo "   Add to PATH: export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
fi

echo ""

# ── mcp-scan (Node) ────────────────────────────────────────────────

if command -v mcp-scan &>/dev/null; then
  CURRENT_VER=$(mcp-scan --version 2>/dev/null || echo "unknown")
  echo "✅ mcp-scan already installed ($CURRENT_VER)"
else
  echo "📦 Installing mcp-scan globally..."
  if command -v npm &>/dev/null; then
    npm install -g mcp-scan@latest 2>/dev/null && echo "✅ mcp-scan installed" \
      || echo "⚠️  npm global install failed — will use npx fallback at runtime"
  else
    echo "⚠️  npm not found — mcp-scan will use npx fallback at runtime"
  fi
fi

# Verify mcp-scan
if command -v mcp-scan &>/dev/null; then
  echo "   $(mcp-scan --version 2>/dev/null || echo 'version unknown')"
else
  echo "   ℹ️  mcp-scan not globally installed; will use 'npx mcp-scan@latest' at runtime"
fi

echo ""

# ── Node dependencies ──────────────────────────────────────────────

if [ -f "package.json" ]; then
  if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ] 2>/dev/null; then
    echo "📦 Installing Node dependencies..."
    if command -v pnpm &>/dev/null; then
      pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    elif command -v npm &>/dev/null; then
      npm ci 2>/dev/null || npm install
    fi
    echo "✅ Node dependencies installed"
  else
    echo "✅ Node dependencies up to date"
  fi
fi

echo ""
echo "🎉 Server setup complete!"
echo ""
echo "Verify:"
echo "  spidershield --version"
echo "  npx mcp-scan --version"
echo ""
