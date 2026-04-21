# Webfunc Skill 包化与 Registry 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 webfunc 的 Skill 从纯 JSON 文件改造为自包含的 JS/TS 模块包，支持通过 Registry 批量安装和管理，并保持向后兼容。

**Architecture:** 新增 `SkillLoader` 作为统一加载层，按优先级（全局安装 > 本地目录 > 本地 JSON）加载 Skill；新增 `SkillModule` 接口允许每个 Skill 包定义自定义执行逻辑（`postProcess`、`executeStep` 等）。CLI 新增 `registry` 和 `install/remove/update` 命令，MCP Server 通过 SkillLoader 统一加载。

**Tech Stack:** TypeScript, Node.js, Commander.js, Playwright, tsx (动态 TS 加载), MCP SDK

---

## 文件结构映射

| 文件 | 职责 |
|------|------|
| `src/types/skill-module.ts` | **新建** — SkillModule 接口定义 |
| `src/core/skill-loader.ts` | **新建** — 统一加载 Skill（全局/本地目录/本地JSON），支持动态导入 TS 模块 |
| `src/core/executor.ts` | **修改** — run 方法改为接受 LoadedSkill，支持 beforeRun/executeStep/postProcess/afterRun 钩子 |
| `src/cli/registry.ts` | **新建** — `registry add/list/remove` 命令 |
| `src/cli/install.ts` | **新建** — `install/remove/update` 命令，管理 `~/.webfunc/` 目录 |
| `src/cli/index.ts` | **修改** — 注册 registry、install 新命令 |
| `src/cli/run.ts` | **修改** — 使用 SkillLoader 加载 Skill，而非直接读文件 |
| `src/cli/list.ts` | **修改** — 使用 SkillLoader 列出所有可用 Skill |
| `src/mcp/server.ts` | **修改** — 使用 SkillLoader 加载和注册 Tools |
| `src/index.ts` | **修改** — 导出 SkillModule 相关类型 |
| `package.json` | **修改** — 将 `tsx` 从 devDependencies 移到 dependencies（运行时动态加载 TS） |
| `skills/zhihu-hot/` | **新建** — 将现有 JSON skill 迁移为包格式（skill.json + index.ts） |

---

## Task 1: SkillModule 类型定义

**Files:**
- Create: `src/types/skill-module.ts`
- Modify: `src/types/skill.ts`（在 ExecutionContext 中新增 `skillPath` 字段供 module 使用）
- Test: `tests/types/skill-module.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
// tests/types/skill-module.test.ts
import { describe, it, expect } from 'vitest';
import type { SkillModule } from '../../src/types/skill-module';

describe('SkillModule type', () => {
  it('should accept a valid SkillModule object', () => {
    const mod: SkillModule = {
      meta: { name: 'test' },
      async postProcess(result) {
        return result;
      },
    };
    expect(mod).toBeDefined();
  });

  it('should allow optional hooks', () => {
    const mod: SkillModule = {};
    expect(mod).toBeDefined();
  });
});
```

Run: `npx vitest run tests/types/skill-module.test.ts`
Expected: FAIL — `Cannot find module '../../src/types/skill-module'`

- [ ] **Step 2: 创建 SkillModule 接口文件**

```typescript
// src/types/skill-module.ts
import type { Skill, ExecutionContext, ExecutionResult, SkillStep } from './skill';

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

- [ ] **Step 3: 在 ExecutionContext 中新增 skillPath**

```typescript
// src/types/skill.ts — 修改 ExecutionContext 接口
export interface ExecutionContext {
  params: Record<string, unknown>;
  stepResults: Record<string, { response: unknown; status: number }>;
  cookies: string;
  page?: import('playwright').Page;
  skillPath?: string;  // 新增：skill 包目录路径，供 module 读写文件
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run tests/types/skill-module.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/skill-module.ts src/types/skill.ts tests/types/skill-module.test.ts
git commit -m "feat: add SkillModule type definition"
```

---

## Task 2: SkillLoader 实现

**Files:**
- Create: `src/core/skill-loader.ts`
- Test: `tests/core/skill-loader.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
// tests/core/skill-loader.test.ts
import { describe, it, expect } from 'vitest';
import { SkillLoader, type LoadedSkill } from '../../src/core/skill-loader';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('SkillLoader', () => {
  const testDir = path.join(os.tmpdir(), 'webfunc-test-' + Date.now());

  it('should load a JSON skill from local file', async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'test-skill.json'),
      JSON.stringify({ name: 'test-skill', version: '1.0.0', target_origin: 'https://example.com', parameters: {}, steps: [], output: { summary: 'done' } })
    );

    const loader = new SkillLoader({ globalDir: testDir, localDir: testDir });
    const loaded = await loader.loadFromPath(testDir);
    expect(loaded.name).toBe('test-skill');
    expect(loaded.skill.name).toBe('test-skill');
    expect(loaded.module).toBeUndefined();
  });

  it('should load a directory skill with module', async () => {
    const skillDir = path.join(testDir, 'pkg-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'skill.json'),
      JSON.stringify({ name: 'pkg-skill', version: '1.0.0', target_origin: 'https://example.com', parameters: {}, steps: [], output: { summary: 'done' } })
    );
    // Note: index.ts won't have postProcess in this test, just verify it loads

    const loader = new SkillLoader({ globalDir: testDir });
    const loaded = await loader.loadFromPath(skillDir);
    expect(loaded.name).toBe('pkg-skill');
    expect(loaded.path).toBe(skillDir);
  });
});
```

Run: `npx vitest run tests/core/skill-loader.test.ts`
Expected: FAIL — `Cannot find module '../../src/core/skill-loader'`

- [ ] **Step 2: 实现 SkillLoader**

```typescript
// src/core/skill-loader.ts
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { pathToFileURL } from 'url';
import type { Skill, SkillModule } from '../types/skill-module';

export interface LoadedSkill {
  name: string;
  skill: Skill;
  module?: SkillModule;
  path: string;
}

export interface SkillLoaderOptions {
  globalDir?: string;
  localDir?: string;
}

function getGlobalDir(): string {
  return path.join(os.homedir(), '.webfunc');
}

function getLinksDir(globalDir: string): string {
  return path.join(globalDir, 'installed', '.links');
}

function getInstalledDir(globalDir: string): string {
  return path.join(globalDir, 'installed');
}

export class SkillLoader {
  private globalDir: string;
  private localDir?: string;

  constructor(options: SkillLoaderOptions = {}) {
    this.globalDir = options.globalDir || getGlobalDir();
    this.localDir = options.localDir;
  }

  /** 加载指定 skill（按优先级查找） */
  async load(name: string): Promise<LoadedSkill> {
    // 1. 全局已安装的 skill
    const globalLink = path.join(getLinksDir(this.globalDir), name);
    try {
      const stat = await fs.stat(globalLink);
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        const realPath = stat.isSymbolicLink() ? await fs.readlink(globalLink) : globalLink;
        const resolved = path.isAbsolute(realPath) ? realPath : path.join(path.dirname(globalLink), realPath);
        return await this.loadFromPath(resolved);
      }
    } catch {
      // not found globally
    }

    // 2. 本地目录 skill
    if (this.localDir) {
      const localDirPath = path.join(this.localDir, name);
      try {
        const stat = await fs.stat(localDirPath);
        if (stat.isDirectory()) {
          return await this.loadFromPath(localDirPath);
        }
      } catch {
        // not found as directory
      }

      // 3. 本地 JSON skill
      const localJsonPath = path.join(this.localDir, `${name}.json`);
      try {
        await fs.access(localJsonPath);
        return await this.loadFromPath(localJsonPath);
      } catch {
        // not found as json
      }
    }

    throw new Error(`Skill "${name}" not found. Install it with: webfunc install ${name}`);
  }

  /** 列出所有可用的 skill */
  async list(): Promise<LoadedSkill[]> {
    const results: LoadedSkill[] = [];
    const seen = new Set<string>();

    // 1. 全局已安装
    const linksDir = getLinksDir(this.globalDir);
    try {
      const links = await fs.readdir(linksDir);
      for (const name of links) {
        if (seen.has(name)) continue;
        try {
          const loaded = await this.load(name);
          results.push(loaded);
          seen.add(name);
        } catch {
          // skip broken links
        }
      }
    } catch {
      // no global skills
    }

    // 2. 本地目录 skills
    if (this.localDir) {
      try {
        const entries = await fs.readdir(this.localDir, { withFileTypes: true });
        for (const entry of entries) {
          if (seen.has(entry.name)) continue;
          if (entry.isDirectory()) {
            const skillPath = path.join(this.localDir, entry.name);
            try {
              const loaded = await this.loadFromPath(skillPath);
              results.push(loaded);
              seen.add(entry.name);
            } catch {
              // not a valid skill directory
            }
          } else if (entry.name.endsWith('.json')) {
            const name = entry.name.replace(/\.json$/, '');
            if (seen.has(name)) continue;
            const skillPath = path.join(this.localDir, entry.name);
            try {
              const loaded = await this.loadFromPath(skillPath);
              results.push(loaded);
              seen.add(name);
            } catch {
              // not valid json
            }
          }
        }
      } catch {
        // no local skills
      }
    }

    return results;
  }

  /** 从指定路径加载 skill（目录或 JSON 文件） */
  async loadFromPath(skillPath: string): Promise<LoadedSkill> {
    const stat = await fs.stat(skillPath);

    if (stat.isFile() && skillPath.endsWith('.json')) {
      // 纯 JSON skill
      const content = await fs.readFile(skillPath, 'utf-8');
      const skill: Skill = JSON.parse(content);
      return {
        name: skill.name,
        skill,
        path: path.dirname(skillPath),
      };
    }

    if (stat.isDirectory()) {
      // 目录型 skill
      const jsonPath = path.join(skillPath, 'skill.json');
      await fs.access(jsonPath);
      const content = await fs.readFile(jsonPath, 'utf-8');
      const skill: Skill = JSON.parse(content);

      // 尝试加载 JS/TS 模块
      const module = await this.loadModule(skillPath);

      // 合并 meta
      const mergedSkill = module?.meta ? { ...module.meta, ...skill } : skill;

      return {
        name: skill.name,
        skill: mergedSkill,
        module,
        path: skillPath,
      };
    }

    throw new Error(`Invalid skill path: ${skillPath}`);
  }

  /** 尝试加载目录中的 JS/TS 模块 */
  private async loadModule(dirPath: string): Promise<SkillModule | undefined> {
    // 优先已编译的 JS，否则尝试 TS
    const candidates = [
      path.join(dirPath, 'index.js'),
      path.join(dirPath, 'index.ts'),
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        const mod = await import(pathToFileURL(candidate).href);
        return (mod.default || mod) as SkillModule;
      } catch {
        // continue to next candidate
      }
    }

    return undefined;
  }
}
```

- [ ] **Step 3: 运行测试验证通过**

Run: `npx vitest run tests/core/skill-loader.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/skill-loader.ts tests/core/skill-loader.test.ts
git commit -m "feat: add SkillLoader with global/local/json/directory support"
```

---

## Task 3: 更新 src/index.ts 导出

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 添加 SkillModule 导出**

```typescript
// src/index.ts — 修改为
export { BrowserBridge, BrowserBridgeOptions } from './core/browser-bridge';
export { CookieStore } from './core/cookie-store';
export { SkillExecutor } from './core/executor';
export { SkillRecorder } from './core/recorder';
export { SkillLoader, type LoadedSkill } from './core/skill-loader';
export { renderTemplate, renderSkillStep } from './core/template-renderer';
export { LLMParser, LLMParserOptions } from './llm/parser';
export * from './types/skill';
export * from './types/skill-module';
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误（如果之前没有类型错误）

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: export SkillLoader and SkillModule types"
```

---

## Task 4: Executor 改造

**Files:**
- Modify: `src/core/executor.ts`
- Test: `tests/core/executor.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
// tests/core/executor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SkillExecutor } from '../../src/core/executor';
import type { LoadedSkill } from '../../src/core/skill-loader';

describe('SkillExecutor with module hooks', () => {
  const executor = new SkillExecutor();

  it('should call postProcess when module provides it', async () => {
    const postProcess = vi.fn(async (result: any) => ({
      ...result,
      summary: result.summary + ' [processed]',
    }));

    const loaded: LoadedSkill = {
      name: 'test',
      path: '/tmp',
      skill: {
        name: 'test',
        version: '1.0.0',
        target_origin: 'https://example.com',
        parameters: {},
        steps: [],
        output: { summary: 'Done' },
      },
      module: {
        postProcess,
      },
    };

    const result = await executor.run(loaded, {
      params: {},
      stepResults: {},
      cookies: '',
    });

    expect(postProcess).toHaveBeenCalled();
    expect(result.summary).toBe('Done [processed]');
  });

  it('should fall back to built-in post_process for legacy skills', async () => {
    const loaded: LoadedSkill = {
      name: 'test',
      path: '/tmp',
      skill: {
        name: 'test',
        version: '1.0.0',
        target_origin: 'https://example.com',
        parameters: {},
        steps: [],
        output: { summary: 'Done' },
        post_process: 'generateMarkdown',
      },
    };

    // generateMarkdown processor requires hotList, so it will gracefully fail
    const result = await executor.run(loaded, {
      params: {},
      stepResults: {},
      cookies: '',
    });

    expect(result.success).toBe(true);
  });
});
```

Run: `npx vitest run tests/core/executor.test.ts`
Expected: FAIL — `SkillExecutor.run` 不接受 `LoadedSkill`

- [ ] **Step 2: 改造 Executor**

```typescript
// src/core/executor.ts — 完整重写
import axios from 'axios';
import { JSONPath } from 'jsonpath-plus';
import { Skill, ExecutionContext, ExecutionResult, SkillStep } from '../types/skill';
import type { LoadedSkill } from './skill-loader';
import { renderSkillStep } from './template-renderer';
import { getPostProcessor } from './post-processors';

export class SkillExecutor {
  async run(loaded: LoadedSkill, context: ExecutionContext): Promise<ExecutionResult> {
    const { skill, module } = loaded;

    // 1. beforeRun 钩子
    if (module?.beforeRun) {
      await module.beforeRun(context);
    }

    const stepResults: ExecutionContext['stepResults'] = {};
    const extractedValues: Record<string, unknown> = {};

    const mode = skill.execution_mode || 'http';

    // 2. 执行 steps
    for (const step of skill.steps || []) {
      const renderContext: ExecutionContext = {
        ...context,
        stepResults,
        params: { ...context.params, ...extractedValues },
        skillPath: loaded.path,
      };
      const renderedStep = renderSkillStep(step, renderContext);

      try {
        const response = module?.executeStep
          ? await module.executeStep(renderedStep, renderContext)
          : mode === 'browser' && context.page
            ? await this.runBrowserStep(renderedStep, context.page)
            : await this.runHttpStep(renderedStep, context.cookies);

        if (step.assert) {
          const assertError = this.validateAssertion(response.status, response.data, step.assert);
          if (assertError) {
            const errorResult: ExecutionResult = {
              success: false,
              summary: '',
              extracted: {},
              error: `Assertion failed on step "${step.id}": ${assertError}`,
            };
            if (module?.afterRun) {
              await module.afterRun(errorResult, { ...renderContext, skillPath: loaded.path });
            }
            return errorResult;
          }
        }

        stepResults[step.id] = {
          response: response.data,
          status: response.status,
        };

        if (step.extract) {
          for (const [key, path] of Object.entries(step.extract)) {
            const result = JSONPath({ path, json: response.data as object }) as unknown[];
            extractedValues[key] = result[0];
          }
        }
      } catch (error: any) {
        const errorResult: ExecutionResult = {
          success: false,
          summary: '',
          extracted: {},
          error: `Request failed on step "${step.id}": ${error.message}`,
        };
        if (module?.afterRun) {
          await module.afterRun(errorResult, { ...renderContext, skillPath: loaded.path });
        }
        return errorResult;
      }
    }

    const finalContext: ExecutionContext = {
      ...context,
      stepResults,
      params: { ...context.params, ...extractedValues },
      skillPath: loaded.path,
    };

    // 3. 生成基础 result
    const renderedOutput = renderSkillStep(
      { id: 'output', method: 'GET', url: skill.output.summary, ...skill.output },
      finalContext
    );

    const extracted: Record<string, unknown> = {};
    if (skill.output.extract) {
      const lastResponse = Object.values(stepResults).pop()?.response;
      for (const [key, path] of Object.entries(skill.output.extract)) {
        const result = JSONPath({ path, json: lastResponse as object }) as unknown[];
        extracted[key] = result[0];
      }
    }

    let result: ExecutionResult = {
      success: true,
      summary: renderedOutput.url,
      extracted,
    };

    // 4. postProcess 钩子（优先用模块的，否则回退到内置处理器）
    if (module?.postProcess) {
      result = await module.postProcess(result, finalContext);
    } else if (skill.post_process) {
      const processor = getPostProcessor(skill.post_process);
      if (processor) {
        result = await processor(result, skill);
      }
    }

    // 5. afterRun 钩子
    if (module?.afterRun) {
      await module.afterRun(result, finalContext);
    }

    return result;
  }

  private async runHttpStep(
    step: SkillStep,
    cookies: string
  ): Promise<{ status: number; data: unknown }> {
    const response = await axios.request({
      method: step.method,
      url: step.url,
      headers: {
        ...step.headers,
        Cookie: cookies,
      },
      data: step.body,
      params: step.query,
    });

    return { status: response.status, data: response.data };
  }

  private async runBrowserStep(
    step: SkillStep,
    page: import('playwright').Page
  ): Promise<{ status: number; data: unknown }> {
    const fetchArgs = {
      url: step.url,
      method: step.method,
      headers: step.headers || {},
      body: typeof step.body === 'string' ? step.body : step.body ? JSON.stringify(step.body) : null,
    };

    const result = await page.evaluate(async (args) => {
      const options: RequestInit = {
        method: args.method,
        headers: args.headers,
        credentials: 'include',
      };
      if (args.body && args.method !== 'GET') {
        options.body = args.body;
      }

      const res = await fetch(args.url, options);
      const text = await res.text();

      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const tables = Array.from(doc.querySelectorAll('table'));
        if (tables.length > 0) {
          let bestTable: HTMLTableElement | null = null;
          let bestRows = 0;
          for (const t of tables) {
            const rows = t.querySelectorAll('tr').length;
            if (rows > bestRows) {
              bestRows = rows;
              bestTable = t;
            }
          }
          if (bestTable && bestRows > 1) {
            const headers = Array.from(bestTable.querySelectorAll('th')).map((h) => h.textContent?.trim() || '');
            const rows = Array.from(bestTable.querySelectorAll('tr')).slice(1).map((row) => {
              const cells = Array.from(row.querySelectorAll('td')).map((c) => {
                const text = c.textContent?.trim() || '';
                const links = Array.from(c.querySelectorAll('a')).map((a) => ({
                  text: a.textContent?.trim() || '',
                  href: a.getAttribute('href') || '',
                  onclick: a.getAttribute('onclick') || '',
                }));
                return links.length > 0 ? { text, links } : text;
              });
              const obj: Record<string, unknown> = {};
              cells.forEach((cell, i) => {
                obj[headers[i] || `col${i}`] = cell;
              });
              return obj;
            });
            data = { headers, rows };
          }
        }
      }

      return {
        status: res.status,
        data,
        contentType: res.headers.get('content-type') || '',
      };
    }, fetchArgs);

    return { status: result.status, data: result.data };
  }

  private validateAssertion(status: number, data: unknown, assert: Record<string, unknown>): string | null {
    for (const [key, expected] of Object.entries(assert)) {
      if (key === 'status') {
        if (status !== expected) return `expected status ${expected}, got ${status}`;
      } else {
        const result = JSONPath({ path: key, json: data as object }) as unknown[];
        const actual = result[0];
        if (actual !== expected) return `expected ${key}=${expected}, got ${actual}`;
      }
    }
    return null;
  }
}
```

- [ ] **Step 3: 运行测试验证通过**

Run: `npx vitest run tests/core/executor.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/executor.ts tests/core/executor.test.ts
git commit -m "feat: refactor executor to use LoadedSkill with module hooks"
```

---

## Task 5: CLI registry 命令

**Files:**
- Create: `src/cli/registry.ts`
- Test: `tests/cli/registry.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/cli/registry.test.ts
import { describe, it, expect } from 'vitest';
import { addRegistry, listRegistries, removeRegistry } from '../../src/cli/registry';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('registry management', () => {
  const testGlobalDir = path.join(os.tmpdir(), 'webfunc-registry-test-' + Date.now());

  it('should add and list a registry', async () => {
    await addRegistry('my-skills', 'https://example.com/registry.json', testGlobalDir);
    const registries = await listRegistries(testGlobalDir);
    expect(registries).toHaveLength(1);
    expect(registries[0].name).toBe('my-skills');
    expect(registries[0].source).toBe('https://example.com/registry.json');
  });

  it('should remove a registry', async () => {
    await addRegistry('to-remove', 'https://example.com/r.json', testGlobalDir);
    await removeRegistry('to-remove', testGlobalDir);
    const registries = await listRegistries(testGlobalDir);
    expect(registries.find((r) => r.name === 'to-remove')).toBeUndefined();
  });
});
```

Run: `npx vitest run tests/cli/registry.test.ts`
Expected: FAIL — `Cannot find module '../../src/cli/registry'`

- [ ] **Step 2: 实现 registry 命令逻辑**

```typescript
// src/cli/registry.ts
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Command } from 'commander';

export interface RegistryEntry {
  name: string;
  source: string;
  addedAt: string;
}

function getGlobalDir(override?: string): string {
  return override || path.join(os.homedir(), '.webfunc');
}

function getRegistryPath(globalDir: string): string {
  return path.join(globalDir, 'registry.json');
}

async function readRegistries(globalDir: string): Promise<RegistryEntry[]> {
  try {
    const data = await fs.readFile(getRegistryPath(globalDir), 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeRegistries(globalDir: string, registries: RegistryEntry[]): Promise<void> {
  await fs.mkdir(globalDir, { recursive: true });
  await fs.writeFile(getRegistryPath(globalDir), JSON.stringify(registries, null, 2));
}

export async function addRegistry(name: string, source: string, globalDir?: string): Promise<void> {
  const dir = getGlobalDir(globalDir);
  const registries = await readRegistries(dir);
  const existing = registries.findIndex((r) => r.name === name);
  const entry: RegistryEntry = { name, source, addedAt: new Date().toISOString() };
  if (existing >= 0) {
    registries[existing] = entry;
    console.log(`Registry "${name}" updated.`);
  } else {
    registries.push(entry);
    console.log(`Registry "${name}" added.`);
  }
  await writeRegistries(dir, registries);
}

export async function listRegistries(globalDir?: string): Promise<RegistryEntry[]> {
  const dir = getGlobalDir(globalDir);
  return readRegistries(dir);
}

export async function removeRegistry(name: string, globalDir?: string): Promise<void> {
  const dir = getGlobalDir(globalDir);
  const registries = await readRegistries(dir);
  const filtered = registries.filter((r) => r.name !== name);
  if (filtered.length === registries.length) {
    console.log(`Registry "${name}" not found.`);
    return;
  }
  await writeRegistries(dir, filtered);
  console.log(`Registry "${name}" removed.`);
}

export function createRegistryCommand(): Command {
  const registry = new Command('registry')
    .description('Manage skill registries');

  registry
    .command('add')
    .description('Add a skill registry')
    .argument('<name>', 'Registry name')
    .argument('<source>', 'Registry source (git URL or file path)')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (name, source, options) => {
      await addRegistry(name, source, options.globalDir);
    });

  registry
    .command('list')
    .description('List all registries')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (options) => {
      const registries = await listRegistries(options.globalDir);
      if (registries.length === 0) {
        console.log('No registries configured.');
        return;
      }
      console.log('\nRegistries:');
      for (const r of registries) {
        console.log(`  ${r.name}: ${r.source}`);
      }
    });

  registry
    .command('remove')
    .description('Remove a registry')
    .argument('<name>', 'Registry name')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (name, options) => {
      await removeRegistry(name, options.globalDir);
    });

  return registry;
}
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run tests/cli/registry.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/registry.ts tests/cli/registry.test.ts
git commit -m "feat: add registry management commands (add/list/remove)"
```

---

## Task 6: CLI install/remove/update 命令

**Files:**
- Create: `src/cli/install.ts`
- Test: `tests/cli/install.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/cli/install.test.ts
import { describe, it, expect } from 'vitest';
import { installSkill, removeSkill, listInstalledSkills } from '../../src/cli/install';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('install management', () => {
  const testGlobalDir = path.join(os.tmpdir(), 'webfunc-install-test-' + Date.now());
  const testSkillDir = path.join(os.tmpdir(), 'test-skill-pkg-' + Date.now());

  it('should install a local skill', async () => {
    // 创建临时 skill
    await fs.mkdir(testSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(testSkillDir, 'skill.json'),
      JSON.stringify({ name: 'test-pkg', version: '1.0.0', target_origin: 'https://example.com', parameters: {}, steps: [], output: { summary: 'done' } })
    );

    await installSkill(testSkillDir, testGlobalDir);
    const installed = await listInstalledSkills(testGlobalDir);
    expect(installed).toContain('test-pkg');
  });

  it('should remove an installed skill', async () => {
    await removeSkill('test-pkg', testGlobalDir);
    const installed = await listInstalledSkills(testGlobalDir);
    expect(installed).not.toContain('test-pkg');
  });
});
```

Run: `npx vitest run tests/cli/install.test.ts`
Expected: FAIL — `Cannot find module '../../src/cli/install'`

- [ ] **Step 2: 实现 install 命令逻辑**

```typescript
// src/cli/install.ts
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { Command } from 'commander';
import { listRegistries } from './registry';

function getGlobalDir(override?: string): string {
  return override || path.join(os.homedir(), '.webfunc');
}

function getInstalledDir(globalDir: string): string {
  return path.join(globalDir, 'installed');
}

function getLinksDir(globalDir: string): string {
  return path.join(globalDir, 'installed', '.links');
}

function getRegistryInstalledPath(globalDir: string, name: string, version: string): string {
  return path.join(getInstalledDir(globalDir), `${name}@${version}`);
}

function parseGitUrl(source: string): { url: string; branch?: string } {
  const hashIdx = source.lastIndexOf('#');
  if (hashIdx > 0) {
    return { url: source.slice(0, hashIdx), branch: source.slice(hashIdx + 1) };
  }
  return { url: source };
}

export async function installSkill(source: string, globalDir?: string): Promise<void> {
  const dir = getGlobalDir(globalDir);
  const installedDir = getInstalledDir(dir);
  const linksDir = getLinksDir(dir);

  await fs.mkdir(installedDir, { recursive: true });
  await fs.mkdir(linksDir, { recursive: true });

  let sourcePath: string;
  let isLocal = false;

  // 判断是本地路径还是 git URL
  if (source.startsWith('git@') || source.startsWith('https://') || source.startsWith('http://')) {
    // git 安装
    const { url, branch } = parseGitUrl(source);
    const tempDir = path.join(os.tmpdir(), `webfunc-install-${Date.now()}`);

    const branchArg = branch ? `-b ${branch}` : '';
    execSync(`git clone --depth 1 ${branchArg} ${url} ${tempDir}`, { stdio: 'inherit' });
    sourcePath = tempDir;
  } else {
    // 本地路径
    sourcePath = path.resolve(source);
    isLocal = true;
  }

  // 读取 skill.json 获取 name 和 version
  const skillJsonPath = path.join(sourcePath, 'skill.json');
  const content = await fs.readFile(skillJsonPath, 'utf-8');
  const skill = JSON.parse(content);
  const name = skill.name;
  const version = skill.version || '0.0.0';

  if (!name) {
    throw new Error('skill.json must have a "name" field');
  }

  const targetPath = getRegistryInstalledPath(dir, name, version);

  // 复制/移动到安装目录
  if (isLocal) {
    await copyDir(sourcePath, targetPath);
  } else {
    await fs.rename(sourcePath, targetPath);
  }

  // 创建/更新激活链接
  const linkPath = path.join(linksDir, name);
  try {
    await fs.unlink(linkPath);
  } catch {
    // link does not exist
  }
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  await fs.symlink(targetPath, linkPath, symlinkType);

  console.log(`Skill "${name}@${version}" installed.`);
}

export async function installFromRegistry(skillName: string, globalDir?: string): Promise<void> {
  const dir = getGlobalDir(globalDir);
  const registries = await listRegistries(dir);

  for (const registry of registries) {
    try {
      const registryData = await loadRegistry(registry.source);
      const entry = registryData.skills?.find((s: any) => s.name === skillName);
      if (entry) {
        await installSkill(entry.source, globalDir);
        return;
      }
    } catch {
      // skip broken registry
    }
  }

  throw new Error(`Skill "${skillName}" not found in any registry.`);
}

async function loadRegistry(source: string): Promise<any> {
  if (source.startsWith('http')) {
    const { default: fetch } = await import('node-fetch');
    const res = await fetch(source);
    return res.json();
  }
  const content = await fs.readFile(source, 'utf-8');
  return JSON.parse(content);
}

export async function removeSkill(name: string, globalDir?: string): Promise<void> {
  const dir = getGlobalDir(globalDir);
  const linkPath = path.join(getLinksDir(dir), name);

  try {
    await fs.unlink(linkPath);
    console.log(`Skill "${name}" removed.`);
  } catch {
    console.log(`Skill "${name}" is not installed.`);
  }
}

export async function listInstalledSkills(globalDir?: string): Promise<string[]> {
  const dir = getGlobalDir(globalDir);
  const linksDir = getLinksDir(dir);
  try {
    return await fs.readdir(linksDir);
  } catch {
    return [];
  }
}

export async function updateSkill(name: string, globalDir?: string): Promise<void> {
  // 简单实现：remove 然后重新 install
  // 更完整的实现应该读取 registry 中的最新版本
  await removeSkill(name, globalDir);
  await installFromRegistry(name, globalDir);
  console.log(`Skill "${name}" updated.`);
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export function createInstallCommand(): Command {
  return new Command('install')
    .description('Install a skill')
    .argument('[source]', 'Skill name from registry, git URL, or local path')
    .option('-a, --all', 'Install all skills from registries')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (source, options) => {
      if (options.all) {
        const dir = getGlobalDir(options.globalDir);
        const registries = await listRegistries(dir);
        for (const registry of registries) {
          try {
            const registryData = await loadRegistry(registry.source);
            for (const skill of registryData.skills || []) {
              try {
                await installSkill(skill.source, options.globalDir);
              } catch (err: any) {
                console.warn(`Failed to install ${skill.name}: ${err.message}`);
              }
            }
          } catch (err: any) {
            console.warn(`Failed to load registry ${registry.name}: ${err.message}`);
          }
        }
        return;
      }

      if (!source) {
        console.error('Please provide a skill name, git URL, or local path. Use --all to install all from registries.');
        process.exit(1);
      }

      // 判断是 registry name、git URL 还是本地路径
      if (source.includes('@') || source.startsWith('git@') || source.startsWith('http')) {
        // git URL
        await installSkill(source, options.globalDir);
      } else if (path.isAbsolute(source) || source.startsWith('.') || source.startsWith('~')) {
        // 本地路径
        await installSkill(source, options.globalDir);
      } else {
        // 尝试从 registry 安装
        try {
          await installFromRegistry(source, options.globalDir);
        } catch {
          // 如果 registry 找不到，当作本地路径尝试
          await installSkill(source, options.globalDir);
        }
      }
    });
}

export function createRemoveCommand(): Command {
  return new Command('remove')
    .description('Remove an installed skill')
    .argument('<name>', 'Skill name')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (name, options) => {
      await removeSkill(name, options.globalDir);
    });
}

export function createUpdateCommand(): Command {
  return new Command('update')
    .description('Update an installed skill')
    .argument('[name]', 'Skill name (omit for --all)')
    .option('-a, --all', 'Update all installed skills')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (name, options) => {
      if (options.all) {
        const installed = await listInstalledSkills(options.globalDir);
        for (const n of installed) {
          try {
            await updateSkill(n, options.globalDir);
          } catch (err: any) {
            console.warn(`Failed to update ${n}: ${err.message}`);
          }
        }
        return;
      }
      if (!name) {
        console.error('Please provide a skill name or use --all.');
        process.exit(1);
      }
      await updateSkill(name, options.globalDir);
    });
}
```

> 注意：`loadRegistry` 中的 `node-fetch` 引用是一个简化处理，如果项目中没有安装 `node-fetch`，可以用原生 `fetch`（Node 18+）或 axios 替代。由于项目已有 axios，实际实现时应使用 axios。

- [ ] **Step 3: 修正 node-fetch 为 axios**

```typescript
// src/cli/install.ts — 修改 loadRegistry 函数
import axios from 'axios';

async function loadRegistry(source: string): Promise<any> {
  if (source.startsWith('http')) {
    const res = await axios.get(source);
    return res.data;
  }
  const content = await fs.readFile(source, 'utf-8');
  return JSON.parse(content);
}
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run tests/cli/install.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/install.ts tests/cli/install.test.ts
git commit -m "feat: add install/remove/update skill commands"
```

---

## Task 7: CLI 入口注册新命令

**Files:**
- Modify: `src/cli/index.ts`

- [ ] **Step 1: 注册 registry 和 skill 命令**

```typescript
// src/cli/index.ts — 完整重写
#!/usr/bin/env node
import { Command } from 'commander';
import { createRecordCommand } from './record';
import { createRunCommand } from './run';
import { createListCommand } from './list';
import { createMcpCommand } from './mcp';
import { createRegistryCommand } from './registry';
import { createInstallCommand, createRemoveCommand, createUpdateCommand } from './install';

const program = new Command();

program
  .name('webfunc')
  .description('Browser automation + LLM office assistant')
  .version('0.1.0');

program.addCommand(createRecordCommand());
program.addCommand(createRunCommand());
program.addCommand(createListCommand());
program.addCommand(createMcpCommand());
program.addCommand(createRegistryCommand());
program.addCommand(createInstallCommand());
program.addCommand(createRemoveCommand());
program.addCommand(createUpdateCommand());

program.parse();
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: register registry and install commands in CLI"
```

---

## Task 8: run 命令改造

**Files:**
- Modify: `src/cli/run.ts`

- [ ] **Step 1: 使用 SkillLoader 重写 run 命令**

```typescript
// src/cli/run.ts — 完整重写
import { Command } from 'commander';
import { SkillExecutor } from '../core/executor';
import { SkillLoader } from '../core/skill-loader';
import { BrowserBridge } from '../core/browser-bridge';
import { CookieStore } from '../core/cookie-store';
import { LLMParser } from '../llm/parser';

function parseParam(value: string, previous: Record<string, string> = {}) {
  const eqIndex = value.indexOf('=');
  if (eqIndex === -1) {
    throw new Error(`Invalid parameter format: "${value}". Expected "key=value".`);
  }
  const key = value.slice(0, eqIndex);
  const val = value.slice(eqIndex + 1);
  return { ...previous, [key]: val };
}

export function createRunCommand(): Command {
  return new Command('run')
    .description('Execute a recorded Skill')
    .argument('<skill-name>', 'Name of the Skill to run')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .option('-p, --profile <profile>', 'Browser user data directory')
    .option('-P, --param <param>', 'Parameter in key=value format (can be used multiple times)', parseParam, {})
    .option('-i, --interactive', 'Interactively prompt for missing parameters')
    .option('--natural <prompt>', 'Natural language prompt to extract parameters')
    .option('--api-key <key>', 'Anthropic API key for natural language parsing')
    .action(async (skillName, options) => {
      const loader = new SkillLoader({ localDir: options.dir });
      const loaded = await loader.load(skillName);
      const skill = loaded.skill;

      let params: Record<string, unknown> = {};

      // Fill defaults first
      for (const [key, param] of Object.entries(skill.parameters || {})) {
        if (param.default !== undefined) {
          params[key] = param.default;
        }
      }

      // Apply command-line parameters
      if (options.param && Object.keys(options.param).length > 0) {
        Object.assign(params, options.param);
      }

      if (options.natural && options.apiKey) {
        const parser = new LLMParser({ apiKey: options.apiKey });
        const parsed = await parser.parse(options.natural, skill);
        Object.assign(params, parsed);
        console.log('Parsed parameters:', parsed);
      }

      if (options.interactive) {
        const inquirer = (await import('inquirer')).default;
        for (const [key, param] of Object.entries(skill.parameters || {})) {
          if (params[key] !== undefined) continue;
          const answer = await inquirer.prompt([
            {
              type: param.type === 'boolean' ? 'confirm' : 'input',
              name: key,
              message: param.description || `Enter ${key}:`,
              default: param.default,
            },
          ]);
          params[key] = answer[key];
        }
      }

      const bridge = new BrowserBridge({ userDataDir: options.profile });
      const context = await bridge.connect();

      const executor = new SkillExecutor();

      let result: import('../types/skill').ExecutionResult;

      if (skill.execution_mode === 'browser') {
        const page = await bridge.getPage();
        result = await executor.run(loaded, {
          params,
          stepResults: {},
          cookies: '',
          page,
        });
      } else {
        const cookieStore = new CookieStore(context);
        const cookies = await cookieStore.getCookiesForUrl(skill.target_origin);
        result = await executor.run(loaded, {
          params,
          stepResults: {},
          cookies,
        });
      }

      if (result.success) {
        console.log('\n✅', result.summary);
        if (Object.keys(result.extracted).length > 0) {
          console.log('Extracted:', result.extracted);
        }
      } else {
        console.error('\n❌ Error:', result.error);
        process.exit(1);
      }

      await bridge.disconnect();
    });
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/cli/run.ts
git commit -m "feat: refactor run command to use SkillLoader"
```

---

## Task 9: list 命令改造

**Files:**
- Modify: `src/cli/list.ts`

- [ ] **Step 1: 使用 SkillLoader 重写 list 命令**

```typescript
// src/cli/list.ts — 完整重写
import { Command } from 'commander';
import { SkillLoader } from '../core/skill-loader';

export function createListCommand(): Command {
  const list = new Command('list')
    .description('List all recorded Skills')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .action(async (options) => {
      const loader = new SkillLoader({ localDir: options.dir });
      const skills = await loader.list();

      if (skills.length === 0) {
        console.log('No skills found.');
        return;
      }

      console.log('\nAvailable Skills:');
      for (const loaded of skills) {
        const marker = loaded.module ? '📦' : '📄';
        const steps = loaded.skill.steps?.length || 0;
        console.log(`  ${marker} ${loaded.name}: ${loaded.skill.description || 'No description'} (${steps} steps)`);
      }
    });

  const show = new Command('show')
    .description('Show details of a recorded Skill')
    .argument('<skill-name>', 'Name of the Skill')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .action(async (skillName, options) => {
      const loader = new SkillLoader({ localDir: options.dir });
      const loaded = await loader.load(skillName);
      console.log(JSON.stringify(loaded.skill, null, 2));
      if (loaded.module) {
        console.log('\n[Has custom module]');
      }
    });

  return new Command('skills')
    .description('Skill management commands')
    .addCommand(list)
    .addCommand(show);
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/cli/list.ts
git commit -m "feat: refactor list command to use SkillLoader"
```

---

## Task 10: MCP Server 改造

**Files:**
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: 使用 SkillLoader 重写 MCP Server**

```typescript
// src/mcp/server.ts — 完整重写
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { SkillLoader } from '../core/skill-loader.js';
import { SkillExecutor } from '../core/executor.js';
import { BrowserBridge } from '../core/browser-bridge.js';
import { CookieStore } from '../core/cookie-store.js';
import type { SkillParameter } from '../types/skill.js';

export interface McpServerOptions {
  skillsDir: string;
  profile?: string;
}

function parameterToJsonSchema(param: SkillParameter): Record<string, object | string | number | boolean> {
  const schema: Record<string, object | string | number | boolean> = {
    type: param.type === 'number' ? 'number' : param.type === 'boolean' ? 'boolean' : 'string',
  };
  if (param.description) schema.description = param.description;
  if (param.default !== undefined) schema.default = param.default;
  return schema;
}

export async function startMcpServer(options: McpServerOptions): Promise<void> {
  // Load skills via SkillLoader
  const loader = new SkillLoader({ localDir: options.skillsDir });
  const loadedSkills = await loader.list();

  // Build tool list
  const tools: Tool[] = [];
  for (const loaded of loadedSkills) {
    const skill = loaded.skill;
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(skill.parameters || {})) {
      properties[key] = parameterToJsonSchema(param);
      if (param.required) required.push(key);
    }

    tools.push({
      name: skill.name,
      description: skill.description || `Execute ${skill.name} skill`,
      inputSchema: {
        type: 'object',
        properties,
        required,
      },
    });
  }

  // Browser bridge (lazy-connect for browser-mode skills)
  let bridge: BrowserBridge | null = null;
  let bridgeContext: Awaited<ReturnType<BrowserBridge['connect']>> | null = null;

  async function ensureBridge(): Promise<BrowserBridge> {
    if (bridge && bridgeContext) return bridge;
    bridge = new BrowserBridge({ userDataDir: options.profile });
    bridgeContext = await bridge.connect();
    return bridge;
  }

  // Create MCP server
  const server = new Server(
    { name: 'webfunc', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    let loaded;
    try {
      loaded = await loader.load(name);
    } catch {
      return {
        content: [{ type: 'text', text: `Skill "${name}" not found` }],
        isError: true,
      };
    }

    const skill = loaded.skill;

    // Fill defaults
    const params: Record<string, unknown> = {};
    for (const [key, param] of Object.entries(skill.parameters || {})) {
      if (param.default !== undefined) params[key] = param.default;
    }
    if (args && typeof args === 'object') {
      Object.assign(params, args);
    }

    // Check required params
    for (const [key, param] of Object.entries(skill.parameters || {})) {
      if (param.required && params[key] === undefined) {
        return {
          content: [{ type: 'text', text: `Missing required parameter: ${key}` }],
          isError: true,
        };
      }
    }

    const executor = new SkillExecutor();

    try {
      let result;
      if (skill.execution_mode === 'browser') {
        const b = await ensureBridge();
        const page = await b.getPage();
        result = await executor.run(loaded, {
          params,
          stepResults: {},
          cookies: '',
          page,
        });
      } else {
        if (!bridge || !bridgeContext) {
          bridge = new BrowserBridge({ userDataDir: options.profile });
          bridgeContext = await bridge.connect();
        }
        const cookieStore = new CookieStore(bridgeContext);
        const cookies = await cookieStore.getCookiesForUrl(skill.target_origin);
        result = await executor.run(loaded, {
          params,
          stepResults: {},
          cookies,
        });
      }

      if (result.success) {
        const lines: string[] = [result.summary];
        if (Object.keys(result.extracted).length > 0) {
          lines.push('');
          lines.push('Extracted data:');
          lines.push(JSON.stringify(result.extracted, null, 2));
        }
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } else {
        return {
          content: [{ type: 'text', text: result.error || 'Execution failed' }],
          isError: true,
        };
      }
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat: refactor MCP server to use SkillLoader"
```

---

## Task 11: 迁移现有 skill 为包格式

**Files:**
- Create: `skills/zhihu-hot/skill.json`
- Create: `skills/zhihu-hot/index.ts`
- Delete: `skills/zhihu-hot.json`

- [ ] **Step 1: 创建 skill.json（从 zhihu-hot.json 复制，去掉 post_process）**

```json
// skills/zhihu-hot/skill.json
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

- [ ] **Step 2: 创建 index.ts（迁移 post_process 逻辑）**

```typescript
// skills/zhihu-hot/index.ts
import fs from 'fs/promises';
import path from 'path';

export default {
  async postProcess(result: any, context: any) {
    const hotList = result.extracted?.hotList as Array<Record<string, unknown>> | undefined;
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
};
```

- [ ] **Step 3: 删除旧的 zhihu-hot.json**

```bash
git rm skills/zhihu-hot.json
```

- [ ] **Step 4: 验证 SkillLoader 能正确加载新格式的知乎 skill**

创建一个快速验证脚本：
```bash
node -e "
const { SkillLoader } = require('./dist/core/skill-loader');
(async () => {
  const loader = new SkillLoader({ localDir: './skills' });
  const loaded = await loader.load('zhihu-hot');
  console.log('Name:', loaded.name);
  console.log('Has module:', !!loaded.module);
  console.log('Has postProcess:', !!loaded.module?.postProcess);
})();
"
```

Expected output:
```
Name: zhihu-hot
Has module: true
Has postProcess: true
```

- [ ] **Step 5: Commit**

```bash
git add skills/zhihu-hot/
git commit -m "feat: migrate zhihu-hot skill to package format"
```

---

## Task 12: 把 tsx 移到 dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 移动 tsx**

```json
// package.json — dependencies 中添加 tsx，devDependencies 中移除
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "axios": "^1.7.0",
    "commander": "^12.0.0",
    "inquirer": "^9.2.0",
    "jsonpath-plus": "^9.0.0",
    "playwright": "^1.45.0",
    "tsx": "^4.0.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/inquirer": "^9.0.7",
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

> 注意：实际修改 package.json 时，使用 Edit 工具精准移动 tsx 行，不要重写整个文件。

- [ ] **Step 2: 安装依赖**

Run: `npm install`
Expected: 成功完成

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: move tsx to dependencies for runtime TS module loading"
```

---

## Task 13: 构建验证

**Files:**
- 所有已修改文件

- [ ] **Step 1: 运行完整 TypeScript 编译**

Run: `npx tsc`
Expected: 无错误，dist/ 目录生成正确

- [ ] **Step 2: 运行全部测试**

Run: `npx vitest run`
Expected: 全部测试通过

- [ ] **Step 3: Commit**

```bash
git commit -m "build: verify full build and tests pass"
```

---

## Task 14: 端到端手动测试

- [ ] **Step 1: 测试 list 命令能发现新格式的知乎 skill**

```bash
node bin/webfunc skills list -d ./skills
```
Expected: 输出包含 `📦 zhihu-hot`（有 module 标记）

- [ ] **Step 2: 测试 run 命令仍然能执行知乎 skill（不需要浏览器）**

由于知乎 hot API 需要网络，可以用一个已安装的纯 API skill 测试，或者：

```bash
# 先确保有测试环境或跳过
node bin/webfunc run zhihu-hot -d ./skills -p "C:\temp\chrome-dev"
```

Expected: 成功执行，生成 Markdown 文件

- [ ] **Step 3: 测试 registry add 和 install**

```bash
# 添加本地 registry
node bin/webfunc registry add local ./skills/registry.json

# 列出
node bin/webfunc registry list

# 从本地路径安装
node bin/webfunc skill install ./skills/zhihu-hot

# 列出已安装
node bin/webfunc skills list
```

Expected: registry 添加成功，install 安装到 `~/.webfunc/installed/`，list 显示全局安装的 skill

- [ ] **Step 4: Commit（如有修改）**

---

## Spec Coverage Check

| Spec 章节 | 对应 Task | 状态 |
|-----------|----------|------|
| 2.1 Skill 包目录结构 | Task 11 | ✅ |
| 2.2 skill.json 字段兼容 | Task 1, 2 | ✅ |
| 2.3 SkillModule 接口 | Task 1 | ✅ |
| 3.1 Registry 文件格式 | Task 5 | ✅ |
| 3.2 SourceType (git/local) | Task 6 | ✅ |
| 3.3 多 Registry 支持 | Task 5 | ✅ |
| 4.1 CLI 新增命令 | Task 5, 6, 7 | ✅ |
| 4.2 现有命令调整 | Task 8, 9 | ✅ |
| 4.3 安装目录结构 | Task 6 | ✅ |
| 5.1 SkillLoader | Task 2 | ✅ |
| 5.2 Executor 改造 | Task 4 | ✅ |
| 5.3 MCP Server 改造 | Task 10 | ✅ |
| 6. 向后兼容 | Task 2, 4, 8, 9, 10 | ✅ |
| 7. 错误处理 | 各 Task 中的 try/catch | ✅ |

## Placeholder Scan

- 无 "TBD"、"TODO"、"implement later"
- 所有代码块包含完整实现
- 无 "add appropriate error handling" 等模糊描述
- 每个 Task 包含具体测试代码和预期输出
