# 快速开始

5 分钟上手 webfunc：安装 -> 录制 -> 执行。

## 前提条件

- Node.js >= 18
- Chrome 或 Edge 浏览器

## 1. 安装

```bash
git clone https://github.com/ouruibin/webfunc.git
cd webfunc
npm install
```

## 2. 启动浏览器

关闭所有浏览器窗口后，用以下命令启动带远程调试的浏览器：

**Windows Edge:**
```cmd
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="C:\temp\chrome-dev"
```

**Windows Chrome:**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="C:\temp\chrome-dev"
```

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="/tmp/chrome-dev"
```

## 3. 录制 Skill

以知乎热榜为例：

```bash
npm run dev -- record zhihu-hot -o https://www.zhihu.com -p "C:\temp\chrome-dev"
```

终端会显示：
```
Connecting to browser...
Connected. Perform your actions in the browser. Press Enter when done.
```

在浏览器中：
1. 地址栏输入 `https://www.zhihu.com` 并访问
2. 等待页面完全加载
3. 按 Enter 停止录制

## 4. 精简 Skill

录制会捕获大量请求，需要精简。打开 `skills/zhihu-hot.json`，只保留核心 API 请求：

```json
{
  "name": "zhihu-hot",
  "version": "1.0.0",
  "description": "获取知乎热榜数据",
  "target_origin": "https://www.zhihu.com",
  "parameters": {
    "limit": {
      "type": "number",
      "default": 50,
      "description": "获取的热榜条目数量"
    }
  },
  "steps": [
    {
      "id": "hot_search",
      "method": "GET",
      "url": "https://www.zhihu.com/api/v4/search/hot_search",
      "headers": {
        "x-requested-with": "fetch"
      },
      "extract": {
        "hotList": "$.hot_search_queries"
      }
    }
  ],
  "output": {
    "summary": "获取到 {{hotList.length}} 条知乎热榜数据",
    "extract": {
      "hotList": "$.hot_search_queries"
    }
  }
}
```

## 5. 执行 Skill

```bash
npm run dev -- run zhihu-hot -p "C:\temp\chrome-dev"
```

## 6. 配置 MCP（可选）

让大模型也能调用你的 Skills：

```bash
npm run dev -- mcp -p "C:\temp\chrome-dev"
```

详见 [MCP 配置](mcp.md)。

## 下一步

- 了解 [详细录制流程](record.md)
- 安装 [社区 Skills](skills.md)
- 查看 [API 格式参考](api.md)
