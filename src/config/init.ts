// ============================================================
// init — piagent 初始化命令
//
// 创建配置文件、Docker 沙箱镜像、验证环境。
// 使用方式：pi --init
// ============================================================

import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from './logger.js'

const execAsync = promisify(exec)

const CONFIG_DIR = join(homedir(), '.piagent')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG = {
  defaultProvider: 'deepseek',
  defaultModel: 'deepseek-chat',
  output: 'print',
  apiKeys: {},
}

async function ensureDir(): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true })
  }
}

async function createConfig(): Promise<boolean> {
  if (existsSync(CONFIG_PATH)) {
    console.log('  ⏭️  配置文件已存在: ~/.piagent/config.json')
    return true
  }
  await ensureDir()
  await writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf-8')
  console.log('  ✅ 已创建配置文件: ~/.piagent/config.json')
  return true
}

async function buildDockerImage(): Promise<boolean> {
  try {
    await execAsync('docker info', { timeout: 5000 })
  } catch {
    console.log('  ⏭️  Docker 不可用，跳过沙箱镜像构建')
    console.log('  提示: 安装 Docker Desktop 后运行 pi --init 可自动构建')
    return false
  }

  try {
    await execAsync('docker image inspect piagent-sandbox:latest', { timeout: 5000 })
    console.log('  ⏭️  Docker 沙箱镜像已存在: piagent-sandbox:latest')
    return true
  } catch {
    console.log('  🔨 正在构建 Docker 沙箱镜像...')
    try {
      await execAsync('docker build -t piagent-sandbox:latest -f Dockerfile .', {
        timeout: 120_000,
      })
      console.log('  ✅ Docker 沙箱镜像构建完成')
      return true
    } catch (error) {
      console.log('  ❌ Docker 沙箱镜像构建失败')
      logger.error('docker_build_failed', { error: String(error) })
      return false
    }
  }
}

async function checkEnvironment(): Promise<void> {
  const checks: { name: string; pass: boolean }[] = []

  // Node.js
  const nodeVer = process.version
  checks.push({ name: `Node.js ${nodeVer}`, pass: true })

  // Docker
  try {
    await execAsync('docker info', { timeout: 5000 })
    checks.push({ name: 'Docker 可用', pass: true })
  } catch {
    checks.push({ name: 'Docker 可用 (未安装)', pass: false })
  }

  // API Keys
  const providers = [
    { name: 'DeepSeek', key: process.env.DEEPSEEK_API_KEY },
    { name: 'Anthropic', key: process.env.ANTHROPIC_API_KEY },
    { name: 'OpenAI', key: process.env.OPENAI_API_KEY },
  ]

  for (const p of providers) {
    if (p.key) {
      checks.push({ name: `${p.name} API 密钥`, pass: true })
    }
  }

  console.log('\n环境检查:')
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '⚠️'}  ${c.name}`)
  }
}

export async function runInit(): Promise<void> {
  console.log('\n初始化 piagent...\n')

  await createConfig()
  await buildDockerImage()
  await checkEnvironment()

  console.log('\n初始化完成！运行 pi 开始使用 🚀\n')
}