const fs = require('node:fs/promises');
const path = require('node:path');

const LINUX_EXECUTABLE = 'jarvis-installer-unofficial';
const WRAPPED_EXECUTABLE = `${LINUX_EXECUTABLE}-bin`;

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') {
    return;
  }

  const binaryPath = path.join(context.appOutDir, LINUX_EXECUTABLE);
  const wrappedBinaryPath = path.join(context.appOutDir, WRAPPED_EXECUTABLE);

  await fs.rename(binaryPath, wrappedBinaryPath);
  await fs.writeFile(
    binaryPath,
    `#!/bin/sh
set -eu

APPDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BIN="$APPDIR/${WRAPPED_EXECUTABLE}"

if [ -n "\${APPIMAGE:-}" ]; then
  exec "$BIN" --no-sandbox "$@"
fi

exec "$BIN" "$@"
`,
  );
  await fs.chmod(binaryPath, 0o755);
  await fs.chmod(wrappedBinaryPath, 0o755);
};
