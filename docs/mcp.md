# MCP Server 配置

MCP（Model Context Protocol）是 Anthropic 推出的开放协议，让大模型能够调用外部工具。Webfunc 的 MCP Server 会将你的所有 Skills 自动注册为 Tools。

## 启动 MCP Server

```bash
npm run dev -- mcp -p "C:\temp\chrome-dev"
```

## 配置 Claude Desktop

打开配置文件：

| 系统 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

添加配置：

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

Windows 路径中的反斜杠 `\` 在 JSON 中需改为正斜杠 `/` 或双反斜杠 `\\`。

保存后**重启 Claude Desktop**。

## 配置 Cursor

Settings -> MCP -> Add new MCP server

- Name: `webfunc`
- Type: `command`
- Command: `node D:/claude/webfunc/bin/webfunc mcp -p C:/temp/chrome-dev`

## 使用示例

配置完成后，在 Claude 中直接对话：

```
你: 查一下我最近失败的 Hive 任务

Claude: [自动调用 horae-failed-tasks tool]
      参数: { "in_charge": "ouruibin", "state": "3", ... }
      
      查询到 3 条失败任务：
      | 任务ID | 任务名称 | 状态 |
      |--------|----------|------|
      | 106314 | temp_n.odata... | FAILED |
```

大模型根据 Skill 的 `description` 和参数描述，自主理解该工具的作用，无需手动说明参数含义。
