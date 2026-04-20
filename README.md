# Webfunc

浏览器自动化 + LLM 办公助手框架。将浏览器操作录制为 Skill，支持 CLI 执行和 MCP 大模型调用。

## 功能特性

- **录制 (record)** — 通过 CDP 拦截浏览器请求，将操作录制为 Skill
- **执行 (run)** — 复现录制的 HTTP 流程，支持参数注入和数据提取
- **安装 (install)** — 从 Git 仓库或本地路径一键安装社区 Skills
- **浏览器模式** — 在已登录浏览器内执行 fetch，自动维持 session
- **HTML 解析** — 自动将 HTML 表格响应解析为结构化数据
- **MCP Server** — 将 Skills 注册为 MCP Tools，供 Claude/GPT/Cursor 等大模型调用

## 安装

```bash
git clone https://github.com/ouruibin/webfunc.git
cd webfunc
npm install
```

## 快速开始

### 1. 启动浏览器（保留登录态）

```bash
# Windows Edge
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="C:\temp\chrome-dev"
```

### 2. 录制一个 Skill

```bash
npm run dev -- record zhihu-hot -o https://www.zhihu.com -p "C:\temp\chrome-dev"
# 在浏览器中访问知乎热榜页面，按 Enter 停止录制
```

### 3. 执行 Skill

```bash
npm run dev -- run zhihu-hot -p "C:\temp\chrome-dev"
```

### 4. 安装社区 Skills

```bash
# 安装单个 skill
npm run dev -- install https://github.com/ouruibin/webfunc-skills.git#skills/zhihu-hot

# 批量安装所有 skills
npm run dev -- install --all https://github.com/ouruibin/webfunc-skills.git
```

### 5. 启动 MCP Server

```bash
npm run dev -- mcp -p "C:\temp\chrome-dev"
```

配置 Claude Desktop 或 Cursor 后即可在对话中调用 Skills。

## 文档

- [快速开始](docs/quickstart.md) — 5 分钟上手完整流程
- [录制指南](docs/record.md) — 如何录制和精简 Skill
- [Skills 使用与分享](docs/skills.md) — 安装、分享和社区 Skills
- [MCP 配置](docs/mcp.md) — Claude Desktop / Cursor 配置指南
- [API 参考](docs/api.md) — Skill JSON 格式完整说明

## Skills 集合

社区 Skills 集合仓库：[webfunc-skills](https://github.com/ouruibin/webfunc-skills)

```bash
# 一键安装全部社区 Skills
npm run dev -- install --all https://github.com/ouruibin/webfunc-skills.git
```

## License

MIT
