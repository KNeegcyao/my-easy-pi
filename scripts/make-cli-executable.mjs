// scripts/make-cli-executable.mjs
// 在 npm publish 前给 cli.js 加可执行权限（跨平台，替代 chmod +x）
import { chmodSync, existsSync } from 'node:fs'

const CLI_PATH = 'dist/cli.js'

if (existsSync(CLI_PATH)) {
  chmodSync(CLI_PATH, 0o755)
  console.log(`[prepublish] Made ${CLI_PATH} executable (755)`)
} else {
  console.error(`[prepublish] ${CLI_PATH} not found. Did you run 'npm run build' first?`)
  process.exit(1)
}
