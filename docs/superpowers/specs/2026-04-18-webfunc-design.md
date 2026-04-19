# Webfunc 设计文档

**日期**: 2026-04-18
**版本**: 1.0.0

---

## 1. 项目概述

Webfunc 是一个浏览器自动化与 LLM 结合的办公助手框架。核心目标是将日常办公中的重复性浏览器操作封装为可复用的 **Skill**，通过 API 请求录制与参数化模板实现稳定重放，并借助大模型完成需求解析、日志分析与知识库匹配。

---

## 2. 需求场景

### 场景 1：智能会议室预订
1. 打开公司会议平台，查询可用会议室
2. 解析用户自然语言需求（时间、人数、设备要求等）
3. 自动完成会议室预订

### 场景 2：调度平台故障诊断
1. 打开公司调度平台，查询失败实例列表
2. 遍历失败实例，获取对应错误日志
3. AI 对日志进行归类分析
4. 匹配内部知识库，生成对应的解决方案

---

## 3. 架构设计

### 3.1 总体架构

系统分为四层：

```
┌──────────────────────────────────────────┐
│  User / LLM                               │
│  "帮我订明天3点的会议室" / "分析这些日志"    │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│  Skill 执行层 (Executor)                  │
│  - 加载 Skill 模板                         │
│  - 收集/渲染参数                           │
│  - 按序重放 HTTP 请求                      │
│  - 聚合响应结果                            │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│  浏览器连接层 (Browser Bridge)             │
│  - CDP 连接已打开的 Chrome/Edge           │
│  - 读取当前 Cookie / Storage              │
│  - Fallback: 用 userDataDir 启动新实例    │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│  录制层 (Recorder)                        │
│  - 监听用户浏览器发出的请求                │
│  - 自动识别可变字段                        │
│  - 生成参数化模板                          │
└──────────────────────────────────────────┘
```

### 3.2 核心数据流

**录制阶段**：
```
浏览器操作 → 拦截请求/响应 → 去重 → 参数识别 → 保存为 skill.json
```

**执行阶段**：
```
加载 skill.json → 填充参数 → 渲染请求 → 带 Cookie 重放 → 收集结果
```

### 3.3 LLM 交互点

1. **执行前**：解析用户自然语言需求，提取并填充 Skill 参数（如 `date`、`capacity`）
2. **执行后（Scene 2）**：将失败实例日志交给 LLM，进行错误归类、知识库匹配、生成解决方案

---

## 4. Skill 模板设计

### 4.1 模板结构

每个 Skill 是一个 JSON 文件，包含：

- **元信息**：`name`、`version`、`description`、`target_origin`
- **参数定义**：`parameters`，声明执行所需的参数及其类型、默认值
- **执行步骤**：`steps`，按顺序定义 HTTP 请求（含 method、url、headers、query、body）
- **数据提取**：`extract`，使用 JSONPath 从响应中提取数据
- **断言校验**：`assert`，校验响应状态，失败时终止执行
- **输出定义**：`output`，定义执行成功后的返回格式

### 4.2 模板语法

- `{{param}}`：用户提供的参数
- `{{_step_id.response.path}}`：前序步骤的响应值，用于步骤间数据传递
- `extract`：使用 JSONPath 从响应中提取字段存入上下文

### 4.3 后置处理（Scene 2 扩展）

Scene 2 的日志分析流程可定义为 Skill 的 `post_process` 脚本：

```
执行 Skill 获取失败实例列表 → 遍历获取日志 →
LLM 归类错误 → 匹配知识库 → 生成解决方案
```

---

## 5. 录制器设计

### 5.1 工作流程

1. 用户执行 `webfunc record <skill-name>`
2. 通过 CDP 连接目标浏览器，开始监听 `request` / `response` 事件
3. 用户在浏览器上正常完成目标操作
4. 录制器过滤：仅保留目标 origin 的请求，去除静态资源
5. 智能参数识别：
   - 日期/时间字符串 → 候选参数
   - 用户输入的表单值 → 候选参数
   - 从响应中提取的 ID → 标记为步骤间依赖
6. 生成 `skill.json`，用户确认或修改参数名

### 5.2 浏览器连接策略

- **首选**：通过 Chrome DevTools Protocol (CDP) 连接到用户**已打开的浏览器**实例（`ws://localhost:9222`），完全继承当前登录态
- **Fallback**：若连接失败，使用 `userDataDir` 启动新的浏览器实例，复用用户 profile

---

## 6. 执行器设计

### 6.1 工作流程

1. 加载目标 `skill.json`
2. **参数检查**：
   - 缺失的 `required` 参数 → 通过 CLI 交互或 LLM 解析补充
3. **Cookie 获取**：连接浏览器读取当前 Cookie
4. **按序执行 steps**：
   - 渲染模板（替换 `{{param}}` 和 `{{_step.response}}`）
   - 发送 HTTP 请求（带 Cookie 头）
   - 校验 `assert`
   - `extract` 数据存入上下文
5. 执行完毕，返回 `output` 中定义的 `summary` + `extract`

### 6.2 错误处理

- **请求失败**：记录错误详情，支持重试（配置 `retry` 字段）
- **断言失败**：终止执行，返回当前已收集的数据和失败原因
- **Cookie 过期**：提示用户重新登录或尝试刷新

---

## 7. 技术选型

| 层级 | 选型 | 理由 |
|------|------|------|
| 浏览器连接 | **Playwright** | 原生支持 CDP 连接已有 Chrome + `userDataDir` |
| HTTP 录制/重放 | Playwright CDP 事件 + **axios** | 录制监听浏览器，执行时脱离浏览器直接发请求 |
| 模板渲染 | **简易字符串替换**（逐步扩展） | 初期够用，后续可升级为 Handlebars |
| JSON 提取 | **jsonpath-plus** | 标准 JSONPath 实现 |
| LLM 调用 | **Anthropic SDK** (Claude API) | 解析需求、分析日志、匹配知识库 |
| CLI 交互 | **commander.js** + **inquirer.js** | 标准 Node.js CLI 方案 |

---

## 8. 项目结构

```
webfunc/
├── src/
│   ├── core/
│   │   ├── recorder.ts          # 录制器
│   │   ├── executor.ts          # 执行器
│   │   ├── browser-bridge.ts    # 浏览器连接（CDP / userDataDir）
│   │   └── cookie-store.ts      # Cookie 读取/缓存
│   ├── skills/                  # 预置 Skill 模板
│   │   ├── book-meeting-room/
│   │   └── check-failed-instances/
│   ├── llm/                     # LLM 交互层
│   │   ├── parser.ts            # 解析用户指令 → Skill 参数
│   │   ├── log-analyzer.ts      # Scene 2: 日志归类分析
│   │   └── knowledge-base.ts    # 知识库匹配
│   ├── cli/                     # 命令行入口
│   │   ├── record.ts            # webfunc record <skill-name>
│   │   ├── run.ts               # webfunc run <skill-name>
│   │   └── list.ts              # webfunc list
│   └── types/
│       └── skill.ts             # Skill 模板 TS 类型定义
├── skills/                      # 用户录制的 Skill 存储目录（可配置）
├── docs/                        # 使用文档
└── package.json
```

**扩展性保障**：
- `browser-bridge.ts` 独立封装浏览器连接，后续换 Puppeteer 或支持 Firefox 只改这一层
- `llm/` 目录独立，后续换 OpenAI、本地模型只改调用层
- `skills/` 数据目录与代码分离，Skill 可独立分享

---

## 9. CLI 命令规划

```bash
# 录制新 Skill
webfunc record book-meeting-room

# 执行 Skill
webfunc run book-meeting-room

# 交互式执行（逐步填充参数）
webfunc run book-meeting-room --interactive

# 查看已录制的 Skills
webfunc list

# 查看 Skill 详情
webfunc show book-meeting-room
```

---

## 10. 风险与应对

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| CDP 连接失败（浏览器未开 / 端口不对） | 无法录制/执行 | Fallback 到 userDataDir 启动新实例；CLI 提示用户 |
| API 接口变更 | Skill 失效 | 录制时记录响应结构哈希，变更时提示更新；支持快速重新录制 |
| Cookie 过期 | 请求 401 | 执行前检测 Cookie 有效期，过期时提示用户 |
| 参数识别不准 | 模板不可用 | 录制后提供交互式确认环节，允许用户手动修正参数名 |
| 知识库缺失 | Scene 2 解决方案质量低 | 初期人工补充知识库，后续支持 LLM 自动提取沉淀 |

---

## 11. 后续演进方向

1. **更智能的参数识别**：利用 LLM 分析请求内容，自动推断参数语义
2. **Skill 市场**：支持导入/导出 Skill，团队内共享
3. **定时执行**：支持配置 cron，自动巡检调度平台
4. **Web UI**：提供可视化录制界面，降低使用门槛
5. **更多浏览器支持**：Firefox、Safari（通过 Playwright 扩展）
