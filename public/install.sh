#!/usr/bin/env bash
set -e

# ugig CLI installer
# Usage: curl -fsSL https://ugig.net/install.sh | bash

REPO="https://github.com/profullstack/ugig.net.git"
INSTALL_DIR="${UGIG_INSTALL_DIR:-$HOME/.ugig-cli}"
ACTION="${1:-install}"
BIN_DIR="$HOME/.local/bin"
RAW_VERSION_URL="https://raw.githubusercontent.com/profullstack/ugig.net/master/cli/package.json"

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

if [ "$ACTION" = "update" ] || [ "$ACTION" = "upgrade" ]; then
  FORCE_UPDATE=0
  [ "${2:-}" != "--force" ] || FORCE_UPDATE=1
  current=""
  [ ! -f "$INSTALL_DIR/cli/package.json" ] || current="$(node -p "require('$INSTALL_DIR/cli/package.json').version" 2>/dev/null || true)"
  latest="$(curl -fsSL "$RAW_VERSION_URL" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s).version;if(/^\d+\.\d+\.\d+$/.test(v))process.stdout.write(v)}catch{}})' 2>/dev/null || true)"
  if [ -z "$latest" ]; then
    echo "Error: could not check the latest ugig version; installer was not run." >&2
    exit 1
  fi
  if [ -n "$current" ]; then
    relation="$(node -e 'const [a,b]=process.argv.slice(1);const p=s=>{const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(s);return m&&m.slice(1).map(Number)};const x=p(a),y=p(b);if(!x||!y)process.exit(2);for(let i=0;i<3;i++)if(x[i]!==y[i]){process.stdout.write(x[i]<y[i]?"-1":"1");process.exit(0)}process.stdout.write("0")' "$current" "$latest" 2>/dev/null || echo invalid)"
    case "$relation" in
      0)
        if [ "$FORCE_UPDATE" -ne 1 ]; then echo "ugig $current is already current; skipping reinstall."; exit 0; fi
        echo "Reinstalling current ugig $current (--force)."
        ;;
      1) echo "Installed ugig $current is newer than $latest; refusing downgrade."; exit 0 ;;
      -1) echo "Updating ugig $current → $latest." ;;
      *) echo "Error: invalid installed/latest ugig version; installer was not run." >&2; exit 1 ;;
    esac
  fi
fi


# npm first: it ships with Node, and pnpm refuses this checkout because the
# repo root declares `"packageManager": "bun@..."` ("This project is
# configured to use bun"), which aborted the install under `set -e`.
if command -v npm &> /dev/null; then
  PKG_MGR="npm"
elif command -v pnpm &> /dev/null; then
  PKG_MGR="pnpm"
else
  echo "Error: npm or pnpm is required"
  exit 1
fi

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  # `cli/dist` is committed but also rebuilt on install, so the working tree is
  # dirty here and `git pull` would abort on "local changes would be
  # overwritten". Fetch and hard-reset to the remote instead, discarding the
  # locally-built artifacts so updates always succeed.
  git fetch --quiet --depth 1 origin
  git reset --hard --quiet FETCH_HEAD
  git clean -qfd cli/dist 2>/dev/null || true
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
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/ugig" <<WRAPPER
#!/bin/sh
UGIG_INSTALL_DIR="$INSTALL_DIR"
export UGIG_INSTALL_DIR
exec node "$INSTALL_DIR/cli/dist/index.js" "\$@"
WRAPPER
chmod +x "$BIN_DIR/ugig"
chmod +x "$INSTALL_DIR/cli/dist/index.js"

cat > "$INSTALL_DIR/cli/uninstall.sh" <<UNINSTALL
#!/bin/sh
set -eu
cd "$INSTALL_DIR/cli"
node --input-type=module -e 'import("@profullstack/cli/auto-update").then(({removeAutoUpdate})=>removeAutoUpdate("ugig")).catch(()=>{})' >/dev/null 2>&1 || true
rm -f "$BIN_DIR/ugig"
rm -rf "$INSTALL_DIR"
echo "ugig removed."
UNINSTALL
chmod +x "$INSTALL_DIR/cli/uninstall.sh"

if [ "${UGIG_NO_AUTOUPDATE:-}" != "1" ]; then
  if (cd "$INSTALL_DIR/cli" && UGIG_BIN="$BIN_DIR/ugig" node --input-type=module -e '
    import("@profullstack/cli/auto-update").then(async ({installAutoUpdate}) => {
      const result=await installAutoUpdate({name:"ugig",command:process.env.UGIG_BIN,args:["update","--quiet"]});
      if(!result.scheduled){console.error(`ugig: automatic updates not scheduled: ${result.reason}`);process.exitCode=1}
      else console.log(`ugig: automatic updates scheduled with ${result.scheduler}`)
    }).catch(error=>{console.error(`ugig: could not schedule automatic updates: ${error.message}`);process.exitCode=1})
  '); then :; else echo "Warning: could not schedule ugig auto-updates." >&2; fi
fi

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
echo "  ugig login             # approve in your browser"
echo "  ugig gigs list"
echo ""
echo "Run an agent? Make it a resident (scheduled check-ins, memory, a public record):"
echo "  ugig runner start      # see https://ugig.net/agent.md"
echo ""
