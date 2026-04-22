# Webfunc

浏览器自动化办公助手框架。将浏览器操作录制为可复用的 **Skill**，通过 CDP 复用已登录浏览器的 session 执行，支持 CLI 调用和 MCP Server 供大模型使用。

## 核心特性

- **浏览器 Session 复用** — 通过 CDP 连接已登录浏览器，所有请求自动携带登录态，无需管理 Cookie/Token
- **Skill Package** — 目录格式（`skill.json` + `index.ts`），支持参数化、动态逻辑和自定义后处理
- **参数化执行** — 支持命令行传参、交互式输入、自然语言解析
- **MCP Server** — 将 Skills 注册为 MCP Tools，供 Claude/Cursor 等大模型调用
- **HTML 表格解析** — 自动将 HTML 表格响应解析为结构化数据

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
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-dev"
```

> 在此浏览器中完成各系统的登录，后续执行将自动复用这些登录态。

### 2. 录制 Skill

```bash
webfunc record <skill-name> -o <目标域名>
```

示例：

```bash
webfunc record meeting-query -o http://ioa.gf.com.cn
```

在浏览器中完成操作后，回到终端按 Enter 停止录制。Skill 生成在 `skills/<name>/skill.json`。

### 3. 参数化改造（推荐）

录制生成的 `skill.json` 是静态的，建议改造为参数化版本。参考已有 Skill：

| Skill | 说明 | 参数 |
|-------|------|------|
| [`meeting-booking`](skills/meeting-booking/) | 查询并预订会议室 | `date`, `startTime`, `endTime`, `floor`, `excludeRoom`, `subject` |
| [`search_datasource`](skills/search_datasource/) | 查询数据源列表 | `keyword` |
| [`search_task_by_source`](skills/search_task_by_source/) | 按数据源查上游任务 | `keyword` |
| [`search_task_by_dest`](skills/search_task_by_dest/) | 按目标服务器查下游任务 | `keyword` |

### 4. 执行 Skill

```bash
# 基础执行（走 CDP 浏览器通道，自动复用 session）
webfunc run meeting-booking \
  --param startTime=10:30 \
  --param subject="数据开发工作讨论"

# 查询数据源
webfunc run search_datasource --param keyword="10.2.21.230"

# 交互式输入参数
webfunc run meeting-booking -i

# 自然语言参数解析（需要 Anthropic API Key）
webfunc run meeting-booking \
  --natural "帮我预订明天下午3点20楼的会议室，讨论数据治理" \
  --api-key <your-api-key>
```

> 所有 skills 默认 `execution_mode: "browser"`，请求在浏览器内执行，自动携带 cookies 和 session。

### 5. MCP Server（大模型调用）

将 Skills 暴露为 MCP Tools：

```bash
webfunc mcp
```

**Claude Desktop 配置**（`claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "webfunc": {
      "command": "node",
      "args": [
        "D:/claude/webfunc/bin/webfunc",
        "mcp"
      ]
    }
  }
}
```

配置后重启 Claude Desktop，对话中会自动识别 Skills 为可用 Tools。

## Skill Package 格式

```
skills/my-skill/
├── skill.json     # Skill 配置（参数定义、HTTP 步骤、数据提取）
└── index.ts       # 可选：自定义钩子（beforeRun / executeStep / postProcess）
```

### skill.json 示例

```json
{
  "name": "meeting-booking",
  "version": "2.0.0",
  "description": "自动查询并预订会议室",
  "target_origin": "http://ioa.gf.com.cn/",
  "execution_mode": "browser",
  "parameters": {
    "date": {
      "type": "string",
      "description": "会议日期，如 2026-04-22，默认为今天",
      "default": ""
    },
    "startTime": {
      "type": "string",
      "description": "开始时间，如 10:00",
      "default": "10:00"
    },
    "floor": {
      "type": "string",
      "description": "楼层关键字，如 200 表示 20 楼",
      "default": "200"
    }
  },
  "steps": [
    {
      "id": "query_room",
      "method": "GET",
      "url": "http://ioa.gf.com.cn/meetingApi/meeting/area/selectMeetingRoomList?keyword={{floor}}&meetingDate={{date}}",
      "headers": {
        "referer": "http://ioa.gf.com.cn/meeting/",
        "accept": "application/json, text/plain, */*"
      }
    }
  ],
  "output": {
    "summary": "会议室查询完成"
  }
}
```

### index.ts 示例

```typescript
export default {
  // 执行前：动态查询可用会议室，自动选择并注入 roomId
  async beforeRun(context: any) {
    const p = context.params;
    const page = context.page;  // Playwright Page 对象

    // 浏览器内执行 fetch，自动复用 session
    const result = await page.evaluate(async (args) => {
      const res = await fetch(args.url, {
        method: 'GET',
        credentials: 'include',  // 自动携带 cookies
      });
      return { status: res.status, data: await res.json() };
    }, { url: `...` });

    // 选择第一个可用会议室
    const rooms = result.data.rows || [];
    const available = rooms.filter(r => r.status === '0');
    p.roomId = available[0].id;
  },

  // 执行后：自定义结果摘要
  async postProcess(result: any, context: any) {
    const p = context.params;
    result.summary = `预订成功: ${p.roomName} | ${p.date} ${p.startTime}-${p.endTime}`;
    return result;
  },
};
```

### SkillModule 钩子

| 钩子 | 时机 | 用途 |
|------|------|------|
| `beforeRun` | 执行前 | 参数校验、动态查询、默认值计算 |
| `executeStep` | 每步执行时 | 自定义 HTTP 调用逻辑 |
| `postProcess` | 全部完成后 | 结果格式化、生成文件、发送通知 |
| `afterRun` | 最终 | 清理工作 |
| `meta` | 加载时 | 覆盖/补充 skill.json 的元信息 |

完整示例见 [`skills/meeting-booking/index.ts`](skills/meeting-booking/index.ts)。

## CLI 命令参考

| 命令 | 说明 | 示例 |
|------|------|------|
| `record <name>` | 录制浏览器操作 | `webfunc record my-task -o https://example.com` |
| `run <name>` | 执行 Skill | `webfunc run meeting-booking --param startTime=14:00` |
| `list` | 列出所有 Skills | `webfunc list` |
| `mcp` | 启动 MCP Server | `webfunc mcp` |
| `package <name>` | 将 JSON 打包为 Package | `webfunc package my-skill` |
| `install <name>` | 安装 Skill Package | `webfunc install my-skill --from ./skills/my-skill` |
| `update <name>` | 更新已安装 Skill | `webfunc update my-skill` |
| `remove <name>` | 卸载 Skill | `webfunc remove my-skill` |
| `registry add <name> <path>` | 添加 Registry | `webfunc registry add local ./skills` |
| `registry list` | 列出 Registries | `webfunc registry list` |
| `registry remove <name>` | 移除 Registry | `webfunc registry remove local` |

### 命令选项

**record**
- `-o, --origin <url>` — 目标域名，只录制该域名请求（必填）
- `-p, --profile <dir>` — 浏览器用户数据目录
- `-d, --dir <dir>` — Skills 输出目录（默认 `./skills`）

**run**
- `-p, --profile <dir>` — 浏览器用户数据目录（CDP 连接失败时回退）
- `-d, --dir <dir>` — Skills 目录（默认 `./skills`）
- `-P, --param <key=value>` — 参数（可多次使用）
- `-i, --interactive` — 交互式提示缺失参数
- `--natural <prompt>` — 自然语言参数解析
- `--api-key <key>` — Anthropic API Key

**mcp**
- `-d, --dir <dir>` — Skills 目录（默认 `./skills`）

## 浏览器模式说明

所有 skills 默认在浏览器内执行请求（`execution_mode: "browser"`）：

```javascript
// 在浏览器 Page 中执行
await page.evaluate(async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',  // 自动携带 cookies
  });
  return res.json();
});
```

优势：
- **免 Token 管理** — 浏览器已登录，请求自动携带 session
- **免反爬** — 请求头、User-Agent、TLS 指纹与真实浏览器一致
- **支持 JS 渲染** — 页面 evaluate 可执行任意前端逻辑

连接优先级：
1. 环境变量 `WEBFUNC_CDP` 指定的 CDP endpoint
2. 默认 `http://127.0.0.1:9222`
3. 若 CDP 连接失败，回退到 `-p` 指定的用户数据目录启动新浏览器

## 项目结构

```
webfunc/
├── bin/webfunc              # CLI 入口
├── skills/                  # Skill Package 目录
│   ├── meeting-booking/
│   ├── search_datasource/
│   ├── search_task_by_source/
│   └── search_task_by_dest/
├── src/
│   ├── cli/                 # CLI 命令
│   │   ├── index.ts         # 命令注册
│   │   ├── record.ts        # 录制命令
│   │   ├── run.ts           # 执行命令
│   │   ├── list.ts          # 列表命令
│   │   ├── mcp.ts           # MCP Server 命令
│   │   ├── install.ts       # 安装命令
│   │   ├── registry.ts      # Registry 管理
│   │   └── package.ts       # 打包命令
│   ├── core/
│   │   ├── browser-bridge.ts    # Playwright CDP 连接
│   │   ├── recorder.ts          # HTTP 请求录制
│   │   ├── executor.ts          # Skill 执行引擎
│   │   ├── template-renderer.ts # 模板渲染
│   │   ├── cookie-store.ts      # Cookie 管理
│   │   ├── post-processors.ts   # 后处理器
│   │   └── skill-loader.ts      # Skill 统一加载器
│   ├── llm/
│   │   └── parser.ts        # 自然语言参数解析
│   ├── mcp/
│   │   └── server.ts        # MCP Server 实现
│   └── types/
│       ├── skill.ts         # Skill 类型定义
│       └── skill-module.ts  # SkillModule 类型定义
└── package.json
```

## 开发

```bash
npm run dev     # 开发模式（tsx）
npm run build   # 编译 TypeScript
npm run test    # 运行测试
```

## License

MIT
