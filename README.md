# Webfunc

Browser automation + LLM office assistant framework. 将浏览器 HTTP 交互录制为可复用的 Skill，支持 CLI 执行和 MCP Server 供大模型调用。

## 功能特性

- **录制 (record)** — 通过 CDP 拦截浏览器请求，将操作录制为 Skill JSON
- **执行 (run)** — 复现录制的 HTTP 流程，支持参数注入和数据提取
- **浏览器模式 (browser mode)** — 在已登录浏览器内执行 fetch，自动维持 session
- **HTML 解析** — 自动将 HTML 表格响应解析为结构化数据
- **MCP Server** — 将 Skills 注册为 MCP Tools，供 Claude/GPT/Cursor 等大模型调用

## 安装

```bash
npm install
npm run build
```

**前置要求：**
- Node.js >= 18
- 已安装 Playwright (`npx playwright install chromium`)

## 快速开始

### 1. 启动浏览器（带远程调试）

关闭所有 Edge/Chrome 窗口后执行：

```bash
# Windows Edge
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="C:\temp\chrome-dev"
```

> 保留此浏览器窗口的登录状态，执行时可直接复用。

### 2. 录制 Skill

```bash
node bin/webfunc record <skill-name> -o <目标域名> -p "C:\temp\chrome-dev"
```

示例：

```bash
node bin/webfunc record zhihu-hot -o https://www.zhihu.com -p "C:\temp\chrome-dev"
```

在浏览器中完成操作后，回到终端按 Enter 停止录制。Skill 文件生成在 `skills/<name>.json`。

### 3. 精简 Skill

录制会包含大量噪声请求，需手动精简保留核心 API 调用。参考已有 Skill：
- `skills/zhihu-hot.json` — 知乎热榜
- `skills/horae-failed-tasks.json` — 内网调度平台失败任务查询

### 4. 执行 Skill

```bash
node bin/webfunc run <skill-name> -p "C:\temp\chrome-dev"
```

交互式输入参数：

```bash
node bin/webfunc run horae-failed-tasks -p "C:\temp\chrome-dev" -i
```

自然语言参数解析（需要 Anthropic API Key）：

```bash
node bin/webfunc run horae-failed-tasks -p "C:\temp\chrome-dev" \
  --natural "查询我名下最近失败的 Hive 任务" \
  --api-key <your-api-key>
```

### 5. MCP Server（大模型调用）

将 Skills 暴露为 MCP Tools，支持 Claude Desktop、Cursor、Cline 等客户端。

**启动方式：**

```bash
node bin/webfunc mcp -p "C:\temp\chrome-dev"
```

**Claude Desktop 配置**（`claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "webfunc": {
      "command": "node",
      "args": [
        "D:/claude/webfunc/bin/webfunc",
        "mcp",
        "-p", "C:/temp/chrome-dev"
      ]
    }
  }
}
```

配置后重启 Claude Desktop，对话中会自动识别 Skills 为可用 Tools，大模型根据描述自主决定调用时机和参数。

## CLI 命令参考

| 命令 | 说明 | 示例 |
|------|------|------|
| `record <name>` | 录制浏览器操作 | `webfunc record my-task -o https://example.com -p "C:\temp\chrome-dev"` |
| `run <name>` | 执行 Skill | `webfunc run my-task -p "C:\temp\chrome-dev"` |
| `list` | 列出所有 Skills | `webfunc list` |
| `mcp` | 启动 MCP Server | `webfunc mcp -p "C:\temp\chrome-dev"` |

### 命令选项

**record**
- `-o, --origin <url>` — 目标域名，只录制该域名请求（必填）
- `-p, --profile <dir>` — 浏览器用户数据目录
- `-d, --dir <dir>` — Skills 输出目录（默认 `./skills`）

**run**
- `-p, --profile <dir>` — 浏览器用户数据目录
- `-d, --dir <dir>` — Skills 目录（默认 `./skills`）
- `-i, --interactive` — 交互式提示缺失参数
- `--natural <prompt>` — 自然语言参数解析
- `--api-key <key>` — Anthropic API Key

**mcp**
- `-p, --profile <dir>` — 浏览器用户数据目录
- `-d, --dir <dir>` — Skills 目录（默认 `./skills`）

## Skill 文件格式

```json
{
  "name": "horae-failed-tasks",
  "version": "1.1.0",
  "description": "查询 Horae 调度平台失败任务清单",
  "target_origin": "http://horae.example.com/",
  "execution_mode": "browser",
  "parameters": {
    "in_charge": {
      "type": "string",
      "required": true,
      "default": "ouruibin",
      "description": "任务负责人账号"
    }
  },
  "steps": [
    {
      "id": "query",
      "method": "POST",
      "url": "http://horae.example.com/task/runTask",
      "headers": { "content-type": "application/x-www-form-urlencoded" },
      "body": "in_charge={{in_charge}}&state=3",
      "extract": { "tasks": "$" }
    }
  ],
  "output": {
    "summary": "查询到失败任务数据",
    "extract": { "tasks": "$" }
  },
  "post_process": "generateMarkdown"
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | Skill 唯一标识 |
| `version` | string | 版本号 |
| `description` | string | 描述（MCP 中作为 tool description） |
| `target_origin` | string | 目标域名，用于 Cookie 获取 |
| `execution_mode` | string | `http`（axios）或 `browser`（浏览器内 fetch） |
| `parameters` | object | 参数定义（类型、必填、默认值、描述） |
| `steps` | array | HTTP 请求步骤序列 |
| `steps[].extract` | object | JSONPath 数据提取规则 |
| `output.summary` | string | 执行摘要模板（支持 `{{param}}`） |
| `output.extract` | object | 最终输出提取规则 |
| `post_process` | string | 后处理器名称 |

### 模板语法

- `{{paramName}}` — 引用 parameters 中的参数
- `{{_stepId.response.path}}` — 引用前序步骤的响应数据

## 浏览器模式 vs HTTP 模式

| 模式 | 通信方式 | 适用场景 |
|------|----------|----------|
| `http` (默认) | 通过 axios 发送请求，手动携带 Cookie | 纯 API 调用，无需登录态 |
| `browser` | 在浏览器内执行 `fetch(..., {credentials: 'include'})` | 需要登录态、有反爬检测的网站 |

浏览器模式会自动复用已登录浏览器的 session，无需手动管理 Cookie。

## 项目结构

```
webfunc/
├── bin/webfunc              # CLI 入口
├── skills/                  # Skill JSON 文件
├── src/
│   ├── cli/                 # CLI 命令
│   │   ├── index.ts         # 命令注册
│   │   ├── record.ts        # 录制命令
│   │   ├── run.ts           # 执行命令
│   │   ├── list.ts          # 列表命令
│   │   └── mcp.ts           # MCP Server 命令
│   ├── core/
│   │   ├── browser-bridge.ts    # Playwright CDP 连接
│   │   ├── recorder.ts          # HTTP 请求录制
│   │   ├── executor.ts          # Skill 执行引擎
│   │   ├── template-renderer.ts # 模板渲染
│   │   ├── cookie-store.ts      # Cookie 管理
│   │   └── post-processors.ts   # 后处理器
│   ├── llm/
│   │   └── parser.ts        # 自然语言参数解析
│   ├── mcp/
│   │   └── server.ts        # MCP Server 实现
│   └── types/
│       └── skill.ts         # 类型定义
├── docs/
│   └── recording-guide.html # 录制详细指南（HTML）
└── package.json
```

## 开发

```bash
npm run dev     # 开发模式
npm run build   # 编译 TypeScript
npm run test    # 运行测试
```

## License

MIT
