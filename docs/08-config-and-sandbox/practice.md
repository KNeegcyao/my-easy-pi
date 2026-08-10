# 本章练习

> 对应源码：`src/config/`、`src/sandbox/`
> 最后更新：2026-08-08
> 适用版本：piagent v0.1.0

---

## 练习 1：配置 API 密钥的两种方式

### 目标

掌握通过环境变量和配置文件两种方式设置 API 密钥，并理解优先级关系。

### 步骤

#### 方式一：环境变量

```bash
# 设置环境变量（临时生效，关闭终端后失效）
export DEEPSEEK_API_KEY="sk-your-deepseek-api-key"
export OPENAI_API_KEY="sk-your-openai-api-key"

# 运行 piagent，环境变量会自动被 ConfigManager 读取
pi -m "你好"
```

#### 方式二：用户配置文件

```bash
# 创建用户配置目录
mkdir -p ~/.piagent

# 创建配置文件
cat > ~/.piagent/config.json << 'EOF'
{
  "defaultProvider": "deepseek",
  "defaultModel": "deepseek-chat",
  "apiKeys": {
    "deepseek": "sk-your-deepseek-api-key",
    "openai": "sk-your-openai-api-key"
  }
}
EOF

# 运行 piagent，配置会被自动加载
pi -m "你好"
```

#### 验证优先级

```bash
# 当环境变量和配置文件同时存在时，环境变量优先
export DEEPSEEK_API_KEY="sk-env-key"
# 此时即使配置文件中写了不同的 key，也会使用环境变量中的值
pi -m "你好"
```

### 思考

1. 两种方式各有什么优缺点？什么场景下应该使用环境变量？
2. 如果同时设置了 `DEEPSEEK_API_KEY` 环境变量和配置文件的 `apiKeys.deepseek`，实际使用的是哪个？为什么这样设计？

---

## 练习 2：查看日志文件

### 目标

学会查看和分析 piagent 的日志文件，理解日志系统的工作方式。

### 步骤

```bash
# 1. 运行 piagent 产生一些日志
pi -m "运行 ls -la 命令"

# 2. 查看今日的访问日志
cat ~/.piagent/logs/access-$(date +%Y-%m-%d).jsonl

# 3. 查看今日的审计日志（记录工具执行）
cat ~/.piagent/logs/audit-$(date +%Y-%m-%d).jsonl

# 4. 使用 jq 工具格式化 JSONL 日志（如果安装了 jq）
cat ~/.piagent/logs/audit-$(date +%Y-%m-%d).jsonl | jq .

# 5. 统计今日执行了多少次工具
cat ~/.piagent/logs/audit-$(date +%Y-%m-%d).jsonl | grep '"tool_execution"' | wc -l
```

### 预期输出

审计日志条目示例（每行一条 JSON）：

```json
{"timestamp":"2026-08-08T10:30:00.000Z","level":"info","message":"tool_execution","tool":"bash","command":"ls -la","exitCode":0,"runtime":"docker"}
{"timestamp":"2026-08-08T10:30:05.000Z","level":"info","message":"tool_execution","tool":"bash","command":"echo hello","exitCode":0,"runtime":"docker"}
```

### 思考

1. 为什么审计日志不输出到终端？这样设计有什么好处？
2. 如何利用审计日志做安全审计？例如检测异常命令执行。

---

## 练习 3：理解 Docker 沙箱的启动过程

### 目标

通过实际操作理解 Docker 沙箱的完整启动流程，从镜像构建到命令执行。

### 步骤

```bash
# 1. 检查 Docker 是否可用
docker info

# 2. 手动构建沙箱镜像
docker build -t piagent-sandbox:latest -f Dockerfile .

# 3. 查看镜像信息
docker images piagent-sandbox:latest

# 4. 手动启动一个沙箱容器，执行命令
docker run --rm --name piagent-test \
  --network none --memory 512m --cpus 1 \
  --pids-limit 50 --read-only \
  --tmpfs /tmp:rw,size=10m \
  piagent-sandbox:latest /bin/bash -c 'echo "Hello from sandbox" && ls /workspace'

# 5. 验证沙箱限制
# 尝试访问网络（应失败）
docker run --rm --network none piagent-sandbox:latest curl https://example.com

# 尝试写入系统目录（应失败）
docker run --rm --read-only piagent-sandbox:latest touch /test.txt

# 6. 查看容器自动清理
# 上面的容器都加了 --rm，退出后会被自动删除
docker ps -a | grep piagent-test
```

### 预期结果

- 步骤 4 应成功输出 "Hello from sandbox" 并列出 `/workspace` 目录
- 步骤 5 的两个验证应失败，证明网络和文件系统被限制
- 步骤 6 应没有残留容器

### 思考

1. 执行 `docker run --rm` 时 `--rm` 参数的作用是什么？如果不加这个参数会怎样？
2. 沙箱的 `--network none` 是如何保证安全的？如果要让沙箱能访问网络（如 `npm install`），需要修改哪些配置？
3. 尝试手动触发降级机制：停止 Docker 服务后运行 piagent，观察 bash 工具的执行提示变化。

---

## 综合练习：自定义沙箱镜像

### 目标

在沙箱镜像中添加 Node.js 和 Python 运行环境，扩展沙箱能力。

### 提示

1. 修改 `Dockerfile`，添加 `nodejs` 和 `python3` 包
2. 重新构建镜像：`docker build -t piagent-sandbox:latest -f Dockerfile .`
3. 验证沙箱中可以执行 `node -e "console.log('hello')"` 和 `python3 -c "print('hello')"`
4. 思考：添加更多工具到沙箱中会带来什么安全风险？

---

## 进阶思考题

1. **配置层扩展**：如何为 piagent 添加 `maxTokens` 和 `temperature` 配置项？需要修改哪些文件？CLI 如何支持 `--max-tokens` 参数？

2. **日志增强**：如何实现日志文件自动清理策略（如保留最近 7 天，超过的自动删除）？写出实现思路。

3. **沙箱增强**：如果需要在沙箱中挂载宿主机的当前工作目录（让沙箱可以读写项目文件），需要修改哪些配置？注意不能破坏只读安全策略。

> [📚 返回章节首页](../08-config-and-sandbox/README.md)
>
> [下一章 →](../09-putting-it-together/README.md)