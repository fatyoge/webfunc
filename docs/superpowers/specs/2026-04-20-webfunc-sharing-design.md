# Webfunc 可共享化设计文档

**日期**: 2026-04-20
**版本**: 1.0.0
**状态**: 草案

---

## 1. 背景与目标

### 1.1 背景

当前 webfunc 是一个本地 CLI 工具，skills 以纯 JSON 文件存放在 `./skills/` 目录，使用说明是一份独立的 HTML 页面 `docs/recording-guide.html`。项目缺少：

- 标准的开源项目 README（安装说明、快速开始）
- 结构化的文档体系
- skills 的分发和安装机制

### 1.2 目标

1. **项目可安装**：用户跟大模型说"帮我安装这个项目"并提交 git 链接后，大模型能根据 README 自动完成安装
2. **文档专业化**：参考成熟开源项目，建立 README + docs/ 的 Markdown 文档体系，含索引目录
3. **Skills 可选择安装**：在说明文档中给出一个集合仓库链接，大模型能按文档指引自动安装单个或全部 skills

### 1.3 范围界定（方案B）

本设计为**精简方案**，聚焦"文档 + 集合仓库 + install 命令"三件事，**不实现**以下 4月19日设计中规划的重型功能：

| 不做 | 原因 |
|------|------|
| SkillModule（index.ts 自定义逻辑） | 超出当前需求范围，纯 JSON skill 已够用 |
| Registry 管理命令（add/list/remove） | 集合仓库的 registry.json 只作为机器可读清单，不建持久化的 registry 系统 |
| 全局安装到 `~/.webfunc/` | 保持本地化，skills 仍装在 `./skills/` |
| install/remove/update 全套命令 | 只做 install，不做 remove/update（用户直接删目录即可） |

---

## 2. 文档体系

### 2.1 文件结构

```
webfunc/
├── README.md                    # 项目首页：介绍 + 安装 + 快速开始 + 目录索引
├── docs/
│   ├── quickstart.md            # 5分钟上手：安装 -> 录制 -> 执行
│   ├── record.md                # 详细录制指南
│   ├── skills.md                # Skills 使用与分享（含集合仓库链接）
│   ├── mcp.md                   # MCP Server 配置（Claude/Cursor）
│   └── api.md                   # Skill JSON 格式完整参考
```

### 2.2 README.md 内容结构

1. **顶部** — 项目名称 + 一句话描述 + 徽章（可选）
2. **功能特性** — 5-6 个核心能力 bullet
3. **安装** — `git clone` + `npm install` 两步
4. **快速开始** — 3行命令：录制 -> 执行 -> MCP 配置
5. **目录** — 链接到 docs/ 各文档
6. **Skills 集合** — 链接到 `webfunc-skills` 仓库，一行命令安装所有 skills
7. **License** — MIT（或其他）

### 2.3 docs/ 各文档职责

| 文档 | 内容 |
|------|------|
| `quickstart.md` | 最简路径：启动浏览器 -> 录制 zhihu-hot -> 执行 -> 看结果 |
| `record.md` | 启动调试浏览器、执行录制命令、操作浏览器、停止录制、精简 JSON 的完整流程 |
| `skills.md` | 安装单个 skill、批量安装、查看已安装 skills、skill 格式说明 |
| `mcp.md` | MCP 原理简介、Claude Desktop 配置、Cursor 配置、使用示例 |
| `api.md` | skill.json 所有字段的完整说明、JSONPath 提取语法、模板变量 |

### 2.4 recording-guide.html 处理

旧文件 `docs/recording-guide.html` **删除**，内容按主题拆分至 docs/ 各 Markdown 文档。

---

## 3. 集合仓库（webfunc-skills）

### 3.1 仓库结构

```
webfunc-skills/                  # 独立仓库，由用户自行创建和管理
├── README.md                    # 仓库首页：说明 + 可用 skill 列表
├── registry.json                # 机器可读的 skill 清单（供 install --all 使用）
└── skills/
    ├── zhihu-hot/
    │   ├── skill.json           # 从现有 skills/zhihu-hot.json 迁移
    │   └── README.md            # 该 skill 的独立说明（可选）
    ├── horae-failed-tasks/
    │   ├── skill.json
    │   └── README.md
    └── ...
```

### 3.2 registry.json 格式

```json
{
  "name": "webfunc-skills",
  "version": "1.0.0",
  "skills": [
    {
      "name": "zhihu-hot",
      "version": "1.0.0",
      "description": "获取知乎热榜数据",
      "directory": "skills/zhihu-hot"
    },
    {
      "name": "horae-failed-tasks",
      "version": "1.0.0",
      "description": "查询 Horae 失败任务",
      "directory": "skills/horae-failed-tasks"
    }
  ]
}
```

> registry.json 仅为机器可读清单，不实现 registry add/list/remove 等管理命令。

### 3.3 Skill 迁移

将当前 `webfunc/skills/*.json` 逐个迁移为目录格式：

```
skills/zhihu-hot.json  ->  webfunc-skills/skills/zhihu-hot/skill.json
```

迁移后的 skill 目录可包含：
- `skill.json`（必填）— skill 配置
- `README.md`（可选）— 该 skill 的独立说明

---

## 4. CLI 安装命令

### 4.1 新增命令

```bash
# 从 git 仓库安装单个 skill
# 支持两种 URL 格式：
#   1. 完整 git URL（含子路径）: https://github.com/user/repo.git#path/to/skill
#   2. 简写: user/repo#path/to/skill
webfunc install <git-url>

# 从 git 仓库批量安装所有 skill（读取 registry.json）
webfunc install --all <git-url>

# 从本地路径安装单个 skill
webfunc install <local-path>

# 从本地路径批量安装
webfunc install --all <local-dir>

# 覆盖已存在的 skill
webfunc install --force <source>
```

### 4.2 安装示例

```bash
# 安装知乎热榜 skill
webfunc install https://github.com/ouruibin/webfunc-skills.git#skills/zhihu-hot

# 批量安装集合仓库中所有 skills
webfunc install --all https://github.com/ouruibin/webfunc-skills.git

# 从本地开发中的 skill 安装
webfunc install ./my-skill

# 从本地集合仓库批量安装
webfunc install --all ./webfunc-skills
```

### 4.3 安装目录

所有 skill 安装到 `./skills/` 目录下，使用**目录格式**（即使来源是单文件也转为目录）：

```
skills/
├── zhihu-hot/
│   └── skill.json
├── horae-failed-tasks/
│   └── skill.json
└── ...
```

### 4.4 URL 解析规则

```
<git-url> 格式:
  https://github.com/user/repo.git#branch:path     # 完整格式
  https://github.com/user/repo.git#path            # 默认 main 分支
  git@github.com:user/repo.git#path                # SSH 格式
  user/repo#path                                   # GitHub 简写

解析步骤:
  1. 按 '#' 分割为 repo 部分和 ref 部分
  2. ref 部分按 ':' 分割为 branch 和 path（无冒号则 branch=main）
  3. git clone --branch <branch> --single-branch <repo> 到临时目录
  4. 从临时目录的 <path> 下读取 skill.json
  5. 复制到 ./skills/<skill-name>/
  6. 清理临时目录
```

### 4.5 本地路径安装

```
<local-path> 格式:
  ./path/to/skill-dir        # 单个 skill 目录（目录下有 skill.json）
  ./path/to/skills/          # 批量安装时扫描所有子目录

判断逻辑:
  - 若路径下有 skill.json -> 单 skill 安装
  - 若 --all 且路径下有多个子目录 -> 批量安装
```

---

## 5. Skill 加载统一化

### 5.1 问题

当前 `run.ts` 和 `mcp/server.ts` 各自硬编码了 skill 加载逻辑：

```typescript
// run.ts 第31行
const skillPath = path.join(options.dir, `${skillName}.json`);

// mcp/server.ts 第31-46行
const files = await fs.readdir(options.skillsDir);
const skillFiles = files.filter((f) => f.endsWith('.json'));
```

### 5.2 统一加载函数

新建 `src/core/skill-loader.ts`，提供共享加载逻辑：

```typescript
export async function loadSkill(name: string, dir: string): Promise<Skill>;
export async function listSkills(dir: string): Promise<Array<{ name: string; skill: Skill; path: string }>>;
```

**加载优先级**（同名时）：
1. `./skills/<name>/skill.json`（目录格式，优先）
2. `./skills/<name>.json`（文件格式，回退）

**listSkills 扫描逻辑**：
- 扫描 `./skills/` 目录
- 识别 `.json` 文件 → skill
- 识别子目录（含 `skill.json`）→ skill
- 同名时目录格式优先，跳过文件格式

### 5.3 改造点

| 文件 | 改造内容 |
|------|----------|
| `src/core/skill-loader.ts` | 新建，提供 loadSkill 和 listSkills |
| `src/cli/run.ts` | 使用 loadSkill 替代直接 readFile |
| `src/cli/list.ts` | 使用 listSkills 替代直接 readdir + filter |
| `src/mcp/server.ts` | 使用 listSkills 替代直接 readdir |

---

## 6. 错误处理

| 场景 | 处理方式 |
|------|----------|
| git clone 失败 | 提示"无法克隆仓库，请检查网络连接和 URL"，返回 exit code 1 |
| 路径下无 skill.json | 提示"未找到有效的 skill 配置（期望找到 skill.json）" |
| registry.json 不存在/格式错误 | 提示"registry.json 不存在或格式错误"，列出预期格式 |
| 同名 skill 已存在 | 默认跳过并提示"skill xxx 已存在，跳过（使用 --force 覆盖）" |
| install --all 时部分失败 | 继续安装其余，最后汇总失败列表并返回 exit code 1 |
| skill.json 解析失败 | 提示"skill.json 格式错误"并显示具体错误信息 |

---

## 7. 项目结构变更

```
webfunc/
├── README.md                    # 【新增】项目首页
├── docs/
│   ├── quickstart.md            # 【新增】快速开始
│   ├── record.md                # 【新增】录制指南
│   ├── skills.md                # 【新增】Skills 使用与分享
│   ├── mcp.md                   # 【新增】MCP 配置
│   ├── api.md                   # 【新增】API 格式参考
│   └── recording-guide.html     # 【删除】拆分到各 md 文档
│
├── src/
│   ├── cli/
│   │   ├── index.ts             # 注册 install 命令
│   │   ├── install.ts           # 【新增】install 命令实现
│   │   ├── list.ts              # 改造：使用 listSkills
│   │   ├── run.ts               # 改造：使用 loadSkill
│   │   └── mcp.ts               # 不变（mcp server 由 server.ts 负责）
│   │
│   ├── core/
│   │   └── skill-loader.ts      # 【新增】统一 skill 加载
│   │
│   └── mcp/
│       └── server.ts            # 改造：使用 listSkills
│
├── skills/                      # 保留现有 .json（迁移到集合仓库后逐步清理）
│   └── *.json
│
└── package.json                 # 不变

webfunc-skills/                  # 【新建仓库】
├── README.md
├── registry.json
└── skills/
    └── <name>/
        ├── skill.json
        └── README.md
```

---

## 8. 实现阶段划分

| 阶段 | 内容 | 涉及文件 |
|------|------|----------|
| 1 | 文档体系 | `README.md`, `docs/*.md`, 删除 `recording-guide.html` |
| 2 | Skill 加载统一化 | `src/core/skill-loader.ts`, 改造 `run.ts`, `list.ts`, `server.ts` |
| 3 | CLI install 命令 | `src/cli/install.ts`, `src/cli/index.ts` |
| 4 | 集合仓库创建 | 新建 `webfunc-skills` 仓库，迁移现有 skills |

---

## 9. 与 4月19日设计的对比

| 方面 | 4月19日设计（完整包化） | 本设计（精简方案B） |
|------|----------------------|-------------------|
| Skill 格式 | 目录 + index.ts（SkillModule） | 目录 + skill.json（纯 JSON） |
| 安装位置 | `~/.webfunc/installed/` | `./skills/` |
| Registry | 持久化管理（add/list/remove） | 集合仓库的 registry.json 只读 |
| CLI 命令 | install/remove/update/registry | install（含 --all） |
| 后置处理 | index.ts 中的 postProcess 钩子 | 仍使用内置 post-processors.ts |
| 适用范围 | 重型 skill 包生态 | 文档 + 分发 + 简装 |
