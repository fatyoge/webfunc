# Webfunc Skill 包化与 Registry 设计文档

**日期**: 2026-04-19
**版本**: 1.0.0
**状态**: 已评审

---

## 1. 背景与目标

### 1.1 当前问题

- `post_process` 依赖 `post-processors.ts` 中硬编码的处理器名（如 `"generateMarkdown"`），每个 Skill 的逻辑无法独立封装
- Skill 之间无法分享：同事收到一个 `skill.json` 文件，如果引用了自定义 post_process，执行会失败（因为目标环境没有这个处理器）
- 后置处理逻辑（如生成 Markdown、发邮件）与 webfunc 核心代码耦合，无法按需扩展

### 1.2 目标

- **自包含 Skill 包**：每个 Skill 是一个独立目录，内含配置 + 可选的自定义执行逻辑
- **可分享**：Skill 包可以在团队内通过 git/目录直接分发，安装后立即可用
- **Registry 管理**：通过一个 registry 文件批量管理团队的 Skill 集合，支持一键安装全部
- **向后兼容**：现有纯 JSON Skill 无需改动，继续正常工作

---

## 2. Skill 包结构规范

### 2.1 目录结构

```
skill-zhihu-hot/
├── skill.json          # 元信息、参数定义、HTTP steps（可选，纯逻辑型 Skill 可省略）
├── index.ts            # SkillModule 实现（后置处理、自定义逻辑等）
├── assets/             # 可选：模板文件、图片等
└── README.md           # 使用说明
```

### 2.2 skill.json 字段

与现有格式完全兼容：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | Skill 唯一标识 |
| `version` | string | 是 | 版本号 |
| `description` | string | 否 | 描述（MCP 中作为 tool description） |
| `target_origin` | string | 否 | 目标域名，用于 Cookie 获取 |
| `execution_mode` | string | 否 | `"http"` 或 `"browser"` |
| `parameters` | object | 否 | 参数定义 |
| `steps` | array | 否 | HTTP 请求步骤序列 |
| `output` | object | 否 | 输出定义 |

> `post_process` 字段在 JS 模块型 Skill 中不再使用（由 `index.ts` 中的 `postProcess` 方法替代），但保留以兼容旧格式 Skill。

### 2.3 SkillModule 接口

```typescript
export interface SkillModule {
  /** 可覆盖/补充 skill.json 中的元信息 */
  meta?: Partial<Skill>;

  /** 执行前钩子：参数校验、环境检查 */
  beforeRun?(context: ExecutionContext): Promise<void>;

  /** 自定义步骤执行器（未定义则走默认 HTTP/browser 执行） */
  executeStep?(
    step: SkillStep,
    context: ExecutionContext
  ): Promise<{ status: number; data: unknown }>;

  /** 后置处理：数据格式化、文件生成、通知发送等 */
  postProcess?(result: ExecutionResult, context: ExecutionContext): Promise<ExecutionResult>;

  /** 执行后钩子：清理、日志等 */
  afterRun?(result: ExecutionResult, context: ExecutionContext): Promise<void>;
}
```

### 2.4 示例：知乎热榜 Skill（改造后）

**skill.json：**
```json
{
  "name": "zhihu-hot",
  "version": "1.0.0",
  "description": "获取知乎搜索热榜数据并生成 Markdown",
  "target_origin": "https://www.zhihu.com",
  "parameters": {
    "limit": {
      "type": "number",
      "required": false,
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
        "x-requested-with": "fetch",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
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

**index.ts：**
```typescript
import type { SkillModule, ExecutionResult, ExecutionContext } from 'webfunc';
import fs from 'fs/promises';
import path from 'path';

export default {
  async postProcess(result: ExecutionResult, context: ExecutionContext) {
    const hotList = result.extracted?.hotList as Array<Record<string, unknown>>;
    if (!hotList || !Array.isArray(hotList)) {
      return { ...result, summary: `${result.summary} (no hotList to generate markdown)` };
    }

    const now = new Date().toLocaleString('zh-CN');
    let md = `# 知乎热榜\n\n> 更新时间：${now}\n\n| 排名 | 标题 | 热度 |\n|------|------|------|\n`;

    hotList.forEach((item, index) => {
      const title = (item.query || '未知') as string;
      const url = `https://www.zhihu.com/search?q=${encodeURIComponent(title)}`;
      const heat = (item.hot_show as string) || '-';
      md += `| ${index + 1} | [${title}](${url}) | ${heat} |\n`;
    });

    const filename = `zhihu-hot-${Date.now()}.md`;
    await fs.writeFile(filename, md);

    return {
      ...result,
      summary: `${result.summary}\nMarkdown saved to: ${path.resolve(filename)}`,
    };
  },
} satisfies SkillModule;
```

---

## 3. Registry 机制

### 3.1 Registry 文件格式

Registry 是一个 JSON 文件，列出所有可用的 Skill 包及其来源：

```json
{
  "name": "ouruibin-skill-registry",
  "version": "1.0.0",
  "skills": [
    {
      "name": "zhihu-hot",
      "version": "1.0.0",
      "description": "获取知乎热榜并生成 Markdown",
      "source": "git@github.com:ouruibin/skill-zhihu-hot.git#main",
      "sourceType": "git"
    },
    {
      "name": "horae-log",
      "version": "1.1.0",
      "description": "查询 Horae 失败任务",
      "source": "/path/to/skill-horae-log",
      "sourceType": "local"
    }
  ]
}
```

### 3.2 SourceType 支持

| sourceType | source 格式示例 | 说明 |
|------------|----------------|------|
| `git` | `git@github.com:user/repo.git#branch` | 通过 git clone 安装 |
| `local` | `/absolute/path/to/skill-dir` | 本地目录，创建符号链接或复制 |

### 3.3 多 Registry 支持

用户可添加多个 registry：

```bash
webfunc registry add my-skills git@github.com:ouruibin/webfunc-skills.git
webfunc registry add team-skills /shared/skills/registry.json
```

`install --all` 时合并所有 registry 中的 skill 列表。

---

## 4. CLI 命令设计

### 4.1 新增命令

```bash
# 添加 registry
webfunc registry add <name> <source>

# 列出已注册的 registry
webfunc registry list

# 移除 registry
webfunc registry remove <name>

# 从 registry 列出可用 skill
webfunc registry skills [registry-name]

# 安装 skill（从 registry 查找）
webfunc install <skill-name>

# 安装 skill（从指定来源，不经过 registry）
webfunc install <source-path-or-git-url>

# 安装 registry 中全部 skill
webfunc install --all

# 更新 skill
webfunc update <skill-name>
webfunc update --all

# 移除已安装 skill
webfunc remove <skill-name>
```

### 4.2 现有命令调整

- `webfunc list` — 列出已安装 skill（从 `~/.webfunc/installed/.links/` 读取）
- `webfunc run <skill-name>` — 通过 SkillLoader 加载（优先已安装，回退 `./skills/*.json`）
- `webfunc mcp` — 通过 SkillLoader 加载所有已安装 skill 注册为 MCP Tools

### 4.3 安装目录结构

```
~/.webfunc/
├── registry.json           # 已注册的 registry 列表
│   └── [ { name, source, addedAt }, ... ]
│
├── installed/
│   ├── zhihu-hot@1.0.0/    # 实际安装内容
│   │   ├── skill.json
│   │   ├── index.ts
│   │   └── ...
│   ├── horae-log@1.1.0/
│   │   └── ...
│   │
│   └── .links/             # 激活的 skill 软链接/记录
│       ├── zhihu-hot -> ../zhihu-hot@1.0.0
│       └── horae-log -> ../horae-log@1.1.0
```

### 4.4 安装流程

1. 解析 source（git / local）
2. 下载/复制到 `~/.webfunc/installed/<name>@<version>/`
3. 如包含 `index.ts`，使用 tsx 运行时直接加载（无需预编译）
4. 创建/更新激活链接 `~/.webfunc/installed/.links/<name>`
5. 写入安装记录

---

## 5. 核心组件改造

### 5.1 SkillLoader（新增）

```typescript
export interface LoadedSkill {
  name: string;
  skill: Skill;              // 合并后的配置（JSON 部分）
  module?: SkillModule;       // 可选的 JS 模块
  path: string;               // 安装路径
}

export class SkillLoader {
  constructor(private options: { globalDir: string; localDir?: string });

  /** 加载指定 skill */
  async load(name: string): Promise<LoadedSkill>;

  /** 列出所有已安装 skill */
  async list(): Promise<LoadedSkill[]>;

  /** 加载指定路径的 skill（用于本地目录） */
  async loadFromPath(dirPath: string): Promise<LoadedSkill>;
}
```

**加载优先级：**
1. `~/.webfunc/installed/.links/<name>/`（已安装的全局 skill）
2. `./skills/<name>/`（项目本地 skill 目录）
3. `./skills/<name>.json`（项目本地旧格式 JSON）

**加载逻辑：**
1. 查找 skill 目录
2. 读取 `skill.json` 得到基础配置
3. 如存在 `index.ts`，通过 `tsx` / `ts-node` 动态导入加载 SkillModule
4. 如 `module.meta` 存在，与 `skill.json` 合并（`skill.json` 优先）
5. 返回 `LoadedSkill`

### 5.2 SkillExecutor 改造

```typescript
class SkillExecutor {
  async run(loaded: LoadedSkill, context: ExecutionContext): Promise<ExecutionResult> {
    const { skill, module } = loaded;

    // 1. beforeRun 钩子
    if (module?.beforeRun) {
      await module.beforeRun(context);
    }

    // 2. 执行 steps
    const stepResults: ExecutionContext['stepResults'] = {};
    const extractedValues: Record<string, unknown> = {};

    for (const step of skill.steps || []) {
      const renderContext: ExecutionContext = {
        ...context,
        stepResults,
        params: { ...context.params, ...extractedValues },
      };
      const renderedStep = renderSkillStep(step, renderContext);

      const response = module?.executeStep
        ? await module.executeStep(renderedStep, renderContext)
        : await this.runDefaultStep(renderedStep, context);

      // assert, extract...
    }

    // 3. 生成基础 result
    let result: ExecutionResult = { /* ... */ };

    // 4. postProcess 钩子
    if (module?.postProcess) {
      result = await module.postProcess(result, context);
    } else if (skill.post_process) {
      // 旧格式兼容：回退到内置处理器
      const processor = getPostProcessor(skill.post_process);
      if (processor) result = await processor(result, skill);
    }

    // 5. afterRun 钩子
    if (module?.afterRun) {
      await module.afterRun(result, context);
    }

    return result;
  }
}
```

### 5.3 MCP Server 改造

MCP Server 启动时通过 `SkillLoader` 加载所有已安装 skill：

```typescript
const loader = new SkillLoader({ globalDir: '~/.webfunc' });
const skills = await loader.list();

// 注册 tools
for (const loaded of skills) {
  tools.push({
    name: loaded.skill.name,
    description: loaded.skill.description,
    inputSchema: buildInputSchema(loaded.skill.parameters),
  });
}

// 执行时
const loaded = await loader.load(request.params.name);
const result = await executor.run(loaded, context);
```

MCP 层不感知 skill 是 JSON 还是 JS 模块 —— 统一由 `SkillLoader` + `Executor` 处理。

---

## 6. 向后兼容策略

| 现有形式 | 兼容性 | 说明 |
|----------|--------|------|
| `./skills/*.json` 旧格式 | **完全兼容** | SkillLoader 加载逻辑自动回退到旧格式 |
| `post_process` 字符串引用 | **兼容** | 保留 `getPostProcessor` 注册表，旧 skill 仍可用 |
| CLI `run <name>` | **兼容** | 优先查找已安装 skill，未找到回退 `./skills/` |
| MCP Server | **兼容** | 自动加载已安装 skill + 本地 `./skills/` |

**迁移路径：**
1. 现有 `skills/*.json` 可继续工作
2. 如需自定义逻辑，创建同名目录 `skills/zhihu-hot/`（含 `index.ts`），自动优先加载
3. 逐步将 skill 发布为独立包，通过 `webfunc install` 安装到全局

---

## 7. 错误处理

| 场景 | 处理方式 |
|------|----------|
| `index.ts` 加载/编译失败 | 提示 skill 安装损坏，建议 reinstall |
| `postProcess` 抛异常 | 返回错误 result，afterRun 仍执行（用于清理） |
| 模块和 JSON 配置冲突（如 name 不一致） | 加载时校验，以 JSON 为准并 warn |
| Skill 未找到 | 明确提示：检查是否安装，或 `webfunc install <name>` |
| Registry source 不可达 | 提示网络/路径问题，跳过该 skill 安装 |

---

## 8. 项目结构变更

```
webfunc/
├── src/
│   ├── core/
│   │   ├── recorder.ts          # 录制器（不变）
│   │   ├── executor.ts          # 执行器（改造：接受 LoadedSkill）
│   │   ├── skill-loader.ts      # 【新增】Skill 加载器
│   │   ├── browser-bridge.ts    # 浏览器连接（不变）
│   │   ├── cookie-store.ts      # Cookie 管理（不变）
│   │   ├── template-renderer.ts # 模板渲染（不变）
│   │   └── post-processors.ts   # 后置处理器（保留兼容）
│   │
│   ├── cli/
│   │   ├── index.ts             # 命令注册（新增 install/remove/update/registry）
│   │   ├── record.ts            # 录制命令（不变）
│   │   ├── run.ts               # 执行命令（改造：使用 SkillLoader）
│   │   ├── list.ts              # 列表命令（改造：使用 SkillLoader）
│   │   ├── mcp.ts               # MCP Server 命令（改造：使用 SkillLoader）
│   │   ├── install.ts           # 【新增】install/remove/update
│   │   └── registry.ts          # 【新增】registry add/list/remove
│   │
│   ├── mcp/
│   │   └── server.ts            # MCP Server（改造：使用 SkillLoader）
│   │
│   ├── llm/
│   │   └── parser.ts            # 自然语言参数解析（不变）
│   │
│   └── types/
│       ├── skill.ts             # Skill 类型（新增 SkillModule 接口）
│       └── skill-module.ts      # 【新增】SkillModule 类型定义
│
├── skills/                      # 项目本地 skill（开发/临时使用）
│   ├── zhihu-hot.json           # 旧格式（兼容）
│   └── zhihu-hot/               # 新格式（优先）
│       ├── skill.json
│       └── index.ts
│
└── package.json
```

---

## 9. 实现阶段划分

| 阶段 | 内容 | 涉及文件 |
|------|------|----------|
| 1 | 类型定义 + SkillLoader | `src/types/skill-module.ts`, `src/core/skill-loader.ts` |
| 2 | Executor 改造 | `src/core/executor.ts` |
| 3 | CLI install/registry | `src/cli/install.ts`, `src/cli/registry.ts`, `src/cli/index.ts` |
| 4 | MCP Server 改造 | `src/mcp/server.ts` |
| 5 | 迁移现有 skill | `skills/zhihu-hot/` 目录化改造 |
| 6 | 测试与验证 | CLI 全流程测试、MCP 集成测试 |
