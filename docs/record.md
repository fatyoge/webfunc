# 录制指南

## 启动浏览器

webfunc 通过 CDP（Chrome DevTools Protocol）连接浏览器。启动带远程调试的浏览器：

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

**Linux:**
```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="/tmp/chrome-dev"
```

使用 `--user-data-dir` 可以保留登录态，后续执行和 MCP 调用都能直接复用。

## 执行录制

```bash
npm run dev -- record <skill-name> -o <目标域名> -p <浏览器数据目录>
```

参数说明：

| 参数 | 说明 | 示例 |
|------|------|------|
| `skill-name` | Skill 名称，生成 `{name}.json` | `zhihu-hot` |
| `-o, --origin` | 目标域名，只录制该域名的请求 | `https://www.zhihu.com` |
| `-p, --profile` | 浏览器用户数据目录 | `C:\temp\chrome-dev` |
| `-d, --dir` | 输出目录（默认 ./skills） | `./skills` |

## 录制时的注意事项

1. **保持浏览器非最小化** — 某些网站有反爬机制
2. **不要频繁操作** — 建议只访问目标页面，等待 3-5 秒
3. **不要点击无关链接** — 避免录制过多噪声请求
4. **按 Enter 停止录制** — 回到终端窗口按 Enter

## 精简录制的 Skill

录制会捕获所有请求，包含大量噪声（广告、统计、token 刷新等）。精简步骤：

1. 打开 `skills/xxx.json`
2. 分析每个 step，只保留获取目标数据的 API 请求
3. 添加 `parameters` 定义可参数化的变量
4. 添加 `extract` 用 JSONPath 提取数据
5. 添加 `output.summary` 执行摘要

## 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `CDP connection failed` | 没有启动远程调试浏览器 | 添加 `-p` 参数指定 userDataDir，或先启动浏览器 |
| `401 身份未验证` | API 需要登录态 | 确保浏览器已登录，且使用 `execution_mode: "browser"` |
| 提取结果为 `undefined` | JSONPath 路径不匹配 | 检查 API 响应结构，更新 extract 路径 |
| 录制了太多无用请求 | 页面加载了大量广告/统计 | 精简 steps，只保留核心 API |
