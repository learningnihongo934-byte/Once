#!/usr/bin/env bash
# Builds Once: the playground and docs (dist/web), the export runtime and the `once` command.
#   ./build.sh          build everything
#   ./build.sh test     build, type-check, then run the test stories
#   ./build.sh serve    build, then serve the playground at http://localhost:8830
#   ./build.sh deploy   build, then publish to https://once.rennko.tech (Cloudflare Workers)
#   ./build.sh vsix     package the VS Code extension (vscode/once-language-*.vsix)
#   ./build.sh install  install the VS Code extension and put `once` on your PATH
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --silent

VERSION=$(node -p "require('./package.json').version")
ESB=node_modules/.bin/esbuild
COMMON=(--bundle --target=es2020 --loader:.once=text --define:ONCE_VERSION="\"$VERSION\"" --log-level=warning)

rm -rf dist && mkdir -p dist/web
$ESB src/web/playground.ts "${COMMON[@]}" --minify --format=iife --outfile=dist/web/playground.js
$ESB src/web/docs.ts "${COMMON[@]}" --minify --format=iife --outfile=dist/web/docs.js
$ESB src/web/standalone.ts "${COMMON[@]}" --minify --format=iife --outfile=dist/web/once-web.js
$ESB src/cli.ts "${COMMON[@]}" --platform=node --format=cjs --outfile=dist/once.cjs
cp web/index.html web/docs.html web/style.css dist/web/
printf '/book.html /docs.html 301\n/book /docs 301\n' > dist/web/_redirects
rm -rf vscode/out && mkdir -p vscode/out/web
$ESB src/vscode/extension.ts "${COMMON[@]}" --platform=node --format=cjs --external:vscode --outfile=vscode/out/extension.js
cp dist/once.cjs vscode/out/once.cjs
cp dist/web/once-web.js vscode/out/web/once-web.js
echo "Built dist/ and vscode/out/ (Once $VERSION)"

case "${1:-}" in
  test)
    node_modules/.bin/tsc -p . 
    $ESB src/test.ts "${COMMON[@]}" --platform=node --format=cjs --outfile=dist/test.cjs
    node dist/test.cjs ;;
  serve)
    echo "Serving at http://localhost:8830"
    python3 -m http.server 8830 --directory dist/web ;;
  deploy) npx -y wrangler@4 deploy ;;
  vsix|install)
    rm -f vscode/*.vsix
    (cd vscode && npx -y @vscode/vsce@3 package --skip-license --allow-star-activation >/dev/null)
    VSIX=$(ls vscode/*.vsix)
    echo "Packaged $VSIX"
    if [ "$1" = install ]; then
      CODE=$(command -v code || true)
      [ -z "$CODE" ] && [ -x "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ] && CODE="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
      if [ -n "$CODE" ]; then
        "$CODE" --install-extension "$VSIX" --force && echo "Installed the Once extension in VS Code. Reload VS Code windows to use it."
      else
        echo "Couldn't find VS Code's 'code' command. Install $VSIX from the Extensions view: ... > Install from VSIX."
      fi
      BIN="$HOME/.local/bin"
      mkdir -p "$BIN"
      ln -sf "$PWD/bin/once" "$BIN/once"
      echo "Linked $BIN/once -> $PWD/bin/once"
      case ":$PATH:" in *":$BIN:"*) ;; *) echo "Add $BIN to your PATH to use 'once' anywhere: echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc" ;; esac
    fi ;;
esac
