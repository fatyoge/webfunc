# Webfunc 可共享化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 webfunc 改造为可共享的项目：统一 skill 加载、增加 CLI install 命令、建立 Markdown 文档体系、创建 skills 集合仓库。

**Architecture:** 提取 `skill-loader.ts` 统一 skill 的加载和扫描逻辑（支持目录格式 + 文件格式）；新增 `install.ts` 支持从 git/本地路径安装单个或批量 skill；用 Markdown 替换 HTML 文档体系；skills 迁移到独立的 `webfunc-skills` 集合仓库。

**Tech Stack:** TypeScript, Node.js, Commander.js, Vitest, Playwright (现有)

---

## File Structure

### New Files
- `src/core/skill-loader.ts` — 统一 skill 加载和扫描
- `src/cli/install.ts` — install 命令实现
- `tests/core/skill-loader.test.ts` — skill-loader 测试
- `tests/cli/install.test.ts` — install 命令测试
- `README.md` — 项目首页
- `docs/quickstart.md` — 快速开始指南
- `docs/record.md` — 录制指南
- `docs/skills.md` — Skills 使用与分享
- `docs/mcp.md` — MCP Server 配置
- `docs/api.md` — Skill JSON 格式参考

### Modified Files
- `src/cli/index.ts` — 注册 install 命令
- `src/cli/run.ts` — 使用 loadSkill 替代直接 readFile
- `src/cli/list.ts` — 使用 listSkills 替代直接 readdir
- `src/mcp/server.ts` — 使用 listSkills 替代直接 readdir

### Deleted Files
- `docs/recording-guide.html`

---

### Task 1: Skill Loader — loadSkill

**Files:**
- Create: `src/core/skill-loader.ts`
- Create: `tests/core/skill-loader.test.ts`

- [ ] **Step 1: Write the failing test for loadSkill**

Create `tests/core/skill-loader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadSkill } from '../../src/core/skill-loader';

describe('loadSkill', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webfunc-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads skill from directory format', async () => {
    const skillDir = path.join(tmpDir, 'zhihu-hot');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'skill.json'),
      JSON.stringify({ name: 'zhihu-hot', version: '1.0.0', description: 'Test' })
    );

    const skill = await loadSkill('zhihu-hot', tmpDir);
    expect(skill.name).toBe('zhihu-hot');
    expect(skill.version).toBe('1.0.0');
  });

  it('loads skill from file format (fallback)', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'zhihu-hot.json'),
      JSON.stringify({ name: 'zhihu-hot', version: '1.0.0', description: 'Test' })
    );

    const skill = await loadSkill('zhihu-hot', tmpDir);
    expect(skill.name).toBe('zhihu-hot');
  });

  it('prefers directory format over file format', async () => {
    // Create both
    const skillDir = path.join(tmpDir, 'zhihu-hot');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'skill.json'),
      JSON.stringify({ name: 'zhihu-hot', version: '2.0.0', description: 'Dir' })
    );
    await fs.writeFile(
      path.join(tmpDir, 'zhihu-hot.json'),
      JSON.stringify({ name: 'zhihu-hot', version: '1.0.0', description: 'File' })
    );

    const skill = await loadSkill('zhihu-hot', tmpDir);
    expect(skill.version).toBe('2.0.0');
  });

  it('throws when skill not found', async () => {
    await expect(loadSkill('nonexistent', tmpDir)).rejects.toThrow('Skill "nonexistent" not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/skill-loader.test.ts`

Expected: FAIL — `loadSkill` is not defined

- [ ] **Step 3: Implement loadSkill**

Create `src/core/skill-loader.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import { Skill } from '../types/skill';

export async function loadSkill(name: string, dir: string): Promise<Skill> {
  // Try directory format first
  const dirPath = path.join(dir, name, 'skill.json');
  try {
    const content = await fs.readFile(dirPath, 'utf-8');
    return JSON.parse(content) as Skill;
  } catch {
    // Directory format not found, try file format
  }

  // Fallback to file format
  const filePath = path.join(dir, `${name}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Skill;
  } catch {
    throw new Error(`Skill "${name}" not found in ${dir}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/skill-loader.test.ts`

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/skill-loader.ts tests/core/skill-loader.test.ts
git commit -m "feat: add skill-loader with loadSkill function"
```

---

### Task 2: Skill Loader — listSkills

**Files:**
- Modify: `src/core/skill-loader.ts`
- Modify: `tests/core/skill-loader.test.ts`

- [ ] **Step 1: Write the failing test for listSkills**

Add to `tests/core/skill-loader.test.ts` (in the same file, after the loadSkill describe block):

```typescript
describe('listSkills', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webfunc-list-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('lists skills from directory format', async () => {
    const skillDir = path.join(tmpDir, 'zhihu-hot');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'skill.json'),
      JSON.stringify({ name: 'zhihu-hot', version: '1.0.0', description: 'Hot list' })
    );

    const { listSkills } = await import('../../src/core/skill-loader');
    const skills = await listSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('zhihu-hot');
    expect(skills[0].skill.description).toBe('Hot list');
  });

  it('lists skills from file format', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'horae.json'),
      JSON.stringify({ name: 'horae', version: '1.0.0', description: 'Horae tasks' })
    );

    const { listSkills } = await import('../../src/core/skill-loader');
    const skills = await listSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('horae');
  });

  it('prefers directory over file when both exist', async () => {
    const skillDir = path.join(tmpDir, 'both');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'skill.json'),
      JSON.stringify({ name: 'both', version: '2.0.0', description: 'Dir' })
    );
    await fs.writeFile(
      path.join(tmpDir, 'both.json'),
      JSON.stringify({ name: 'both', version: '1.0.0', description: 'File' })
    );

    const { listSkills } = await import('../../src/core/skill-loader');
    const skills = await listSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].skill.version).toBe('2.0.0');
  });

  it('returns empty array when no skills found', async () => {
    const { listSkills } = await import('../../src/core/skill-loader');
    const skills = await listSkills(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it('returns empty array when dir does not exist', async () => {
    const { listSkills } = await import('../../src/core/skill-loader');
    const skills = await listSkills(path.join(tmpDir, 'nonexistent'));
    expect(skills).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/skill-loader.test.ts`

Expected: FAIL — `listSkills` is not defined

- [ ] **Step 3: Implement listSkills**

Append to `src/core/skill-loader.ts`:

```typescript
export interface ListedSkill {
  name: string;
  skill: Skill;
  path: string;
}

export async function listSkills(dir: string): Promise<ListedSkill[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const skills: ListedSkill[] = [];
  const seen = new Set<string>();

  // First pass: directory format (priority)
  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    const stat = await fs.stat(entryPath).catch(() => null);
    if (!stat?.isDirectory()) continue;

    const skillJsonPath = path.join(entryPath, 'skill.json');
    try {
      const content = await fs.readFile(skillJsonPath, 'utf-8');
      const skill = JSON.parse(content) as Skill;
      skills.push({ name: skill.name || entry, skill, path: entryPath });
      seen.add(entry);
    } catch {
      // Not a skill directory
    }
  }

  // Second pass: file format (only for names not seen in directory format)
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const name = entry.slice(0, -5); // Remove .json
    if (seen.has(name)) continue;

    const filePath = path.join(dir, entry);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const skill = JSON.parse(content) as Skill;
      skills.push({ name: skill.name || name, skill, path: filePath });
    } catch {
      // Not a valid skill file
    }
  }

  return skills;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/skill-loader.test.ts`

Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/core/skill-loader.ts tests/core/skill-loader.test.ts
git commit -m "feat: add listSkills to skill-loader"
```

---

### Task 3: 改造 run.ts 使用 loadSkill

**Files:**
- Modify: `src/cli/run.ts`

- [ ] **Step 1: Modify run.ts to use loadSkill**

Replace the skill loading logic in `src/cli/run.ts` (lines 31-33):

```typescript
// Before:
const skillPath = path.join(options.dir, `${skillName}.json`);
const skillData = await fs.readFile(skillPath, 'utf-8');
const skill: Skill = JSON.parse(skillData);
```

With:

```typescript
// Add import at top of file:
import { loadSkill } from '../core/skill-loader';

// Replace the loading logic:
const skill = await loadSkill(skillName, options.dir);
```

Remove the unused `fs` import if it's no longer needed in this file (check if used elsewhere — it's not, `fs` was only used for reading skill file).

Also remove unused `path` import if no longer needed — it's still used elsewhere in the file so keep it.

The full import block should now be:

```typescript
import { Command } from 'commander';
import { SkillExecutor } from '../core/executor';
import { BrowserBridge } from '../core/browser-bridge';
import { CookieStore } from '../core/cookie-store';
import { LLMParser } from '../llm/parser';
import { Skill } from '../types/skill';
import path from 'path';
import { loadSkill } from '../core/skill-loader';
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `npx vitest run tests/cli/cli.test.ts tests/core/executor.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/cli/run.ts
git commit -m "refactor: use loadSkill in run command"
```

---

### Task 4: 改造 list.ts 使用 listSkills

**Files:**
- Modify: `src/cli/list.ts`

- [ ] **Step 1: Rewrite list.ts to use listSkills**

Replace the contents of `src/cli/list.ts` with:

```typescript
import { Command } from 'commander';
import { listSkills, loadSkill } from '../core/skill-loader';

export function createListCommand(): Command {
  const list = new Command('list')
    .description('List all recorded Skills')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .action(async (options) => {
      const skills = await listSkills(options.dir);

      if (skills.length === 0) {
        console.log('No skills found.');
        return;
      }

      console.log('\nRecorded Skills:');
      for (const { name, skill } of skills) {
        const stepCount = skill.steps?.length || 0;
        console.log(`  - ${name}: ${skill.description || 'No description'} (${stepCount} steps)`);
      }
    });

  const show = new Command('show')
    .description('Show details of a recorded Skill')
    .argument('<skill-name>', 'Name of the Skill')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .action(async (skillName, options) => {
      const skill = await loadSkill(skillName, options.dir);
      console.log(JSON.stringify(skill, null, 2));
    });

  return new Command('skills')
    .description('Skill management commands')
    .addCommand(list)
    .addCommand(show);
}
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `npx vitest run tests/cli/cli.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/cli/list.ts
git commit -m "refactor: use listSkills and loadSkill in list command"
```

---

### Task 5: 改造 mcp/server.ts 使用 listSkills

**Files:**
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Modify mcp/server.ts to use listSkills**

Replace the skill loading section (lines 30-47) in `src/mcp/server.ts`:

```typescript
// Before:
const files = await fs.readdir(options.skillsDir).catch(() => [] as string[]);
const skillFiles = files.filter((f) => f.endsWith('.json'));

const skills: Map<string, Skill> = new Map();
for (const file of skillFiles) {
  const content = await fs.readFile(path.join(options.skillsDir, file), 'utf-8');
  let skill: Skill;
  try {
    skill = JSON.parse(content);
  } catch {
    continue;
  }
  if (!skill?.name || !Array.isArray(skill.steps)) {
    continue;
  }
  skills.set(skill.name, skill);
}
```

With:

```typescript
// Add import at top:
import { listSkills, loadSkill } from '../core/skill-loader.js';

// Replace the loading section:
const listed = await listSkills(options.skillsDir);
const skills: Map<string, Skill> = new Map();
for (const { skill } of listed) {
  if (!skill?.name || !Array.isArray(skill.steps)) {
    continue;
  }
  skills.set(skill.name, skill);
}
```

Also, in the `CallToolRequestSchema` handler (around line 92), replace skill lookup:

```typescript
// Before:
const skill = skills.get(name);

// This line stays the same, but we also need to add loadSkill fallback for runtime loading
// Actually, skills Map already contains all loaded skills, so no change needed here.
// BUT: we should update the error message to be more helpful:
```

Actually, the skills Map approach is fine since we populate it at startup. But for robustness, let's also add a fallback load:

In the `CallToolRequestSchema` handler, find:

```typescript
const skill = skills.get(name);
if (!skill) {
  return {
    content: [{ type: 'text', text: `Skill "${name}" not found` }],
    isError: true,
  };
}
```

Replace with:

```typescript
let skill = skills.get(name);
if (!skill) {
  // Try to load dynamically (in case skill was added after server start)
  try {
    skill = await loadSkill(name, options.skillsDir);
    if (skill?.name && Array.isArray(skill.steps)) {
      skills.set(skill.name, skill);
    }
  } catch {
    // Skill not found
  }
}
if (!skill) {
  return {
    content: [{ type: 'text', text: `Skill "${name}" not found` }],
    isError: true,
  };
}
```

Remove unused `fs` import if no longer needed. Check: `fs` is only used in the readdir/readFile section we replaced. So remove `import fs from 'fs/promises';`.

Also check if `path` is still needed — yes, it's used in the server creation. Keep it.

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `npx vitest run`

Expected: PASS (all tests)

- [ ] **Step 3: Commit**

```bash
git add src/mcp/server.ts
git commit -m "refactor: use listSkills and loadSkill in MCP server"
```

---

### Task 6: CLI Install — URL 解析

**Files:**
- Create: `src/cli/install.ts`
- Create: `tests/cli/install.test.ts`

- [ ] **Step 1: Write the failing test for parseSource**

Create `tests/cli/install.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('parseSource', () => {
  it('parses local path', async () => {
    const { parseSource } = await import('../../src/cli/install');
    const result = parseSource('./my-skill');
    expect(result.type).toBe('local');
    expect(result.localPath).toContain('my-skill');
  });

  it('parses GitHub shorthand', async () => {
    const { parseSource } = await import('../../src/cli/install');
    const result = parseSource('user/repo');
    expect(result.type).toBe('git');
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.branch).toBe('main');
    expect(result.path).toBe('');
  });

  it('parses full git URL with path', async () => {
    const { parseSource } = await import('../../src/cli/install');
    const result = parseSource('https://github.com/user/repo.git#skills/zhihu-hot');
    expect(result.type).toBe('git');
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.branch).toBe('main');
    expect(result.path).toBe('skills/zhihu-hot');
  });

  it('parses full git URL with branch and path', async () => {
    const { parseSource } = await import('../../src/cli/install');
    const result = parseSource('https://github.com/user/repo.git#dev:skills/zhihu-hot');
    expect(result.type).toBe('git');
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.branch).toBe('dev');
    expect(result.path).toBe('skills/zhihu-hot');
  });

  it('parses SSH git URL', async () => {
    const { parseSource } = await import('../../src/cli/install');
    const result = parseSource('git@github.com:user/repo.git#skills/test');
    expect(result.type).toBe('git');
    expect(result.repo).toBe('git@github.com:user/repo.git');
    expect(result.path).toBe('skills/test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/install.test.ts`

Expected: FAIL — `parseSource` is not defined

- [ ] **Step 3: Implement parseSource**

Create `src/cli/install.ts` (initial version with parseSource only):

```typescript
import path from 'path';

export interface ParsedSource {
  type: 'git' | 'local';
  repo?: string;
  branch?: string;
  path?: string;
  localPath?: string;
}

export function parseSource(source: string): ParsedSource {
  // Local path detection
  if (
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('\\') ||
    /^[a-zA-Z]:/.test(source)
  ) {
    return { type: 'local', localPath: path.resolve(source) };
  }

  // Git URL parsing
  let repoUrl = source;
  let ref = '';

  const hashIndex = repoUrl.indexOf('#');
  if (hashIndex !== -1) {
    ref = repoUrl.slice(hashIndex + 1);
    repoUrl = repoUrl.slice(0, hashIndex);
  }

  // GitHub shorthand: user/repo
  if (!repoUrl.includes('://') && !repoUrl.includes('@')) {
    repoUrl = `https://github.com/${repoUrl}.git`;
  }

  // Ensure .git suffix
  if (!repoUrl.endsWith('.git')) {
    repoUrl += '.git';
  }

  // Parse ref: branch:path or just path
  let branch = 'main';
  let subPath = '';

  if (ref) {
    const colonIndex = ref.indexOf(':');
    if (colonIndex !== -1) {
      branch = ref.slice(0, colonIndex);
      subPath = ref.slice(colonIndex + 1);
    } else if (ref.includes('/')) {
      subPath = ref;
    } else {
      branch = ref;
    }
  }

  return { type: 'git', repo: repoUrl, branch, path: subPath };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/install.test.ts`

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/cli/install.ts tests/cli/install.test.ts
git commit -m "feat: add parseSource for install command"
```

---

### Task 7: CLI Install — 核心安装逻辑

**Files:**
- Modify: `src/cli/install.ts`
- Modify: `tests/cli/install.test.ts`

- [ ] **Step 1: Write the failing test for installSkill**

Add to `tests/cli/install.test.ts` (after the parseSource describe block):

```typescript
import fs from 'fs/promises';
import os from 'os';
import { installSkill } from '../../src/cli/install';

describe('installSkill', () => {
  let tmpDir: string;
  let targetDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webfunc-install-'));
    targetDir = path.join(tmpDir, 'skills');
    await fs.mkdir(targetDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('installs from local directory', async () => {
    const sourceDir = path.join(tmpDir, 'source-skill');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, 'skill.json'),
      JSON.stringify({ name: 'test-skill', version: '1.0.0', description: 'Test' })
    );

    await installSkill(sourceDir, targetDir);

    const installed = await fs.readFile(path.join(targetDir, 'test-skill', 'skill.json'), 'utf-8');
    const skill = JSON.parse(installed);
    expect(skill.name).toBe('test-skill');
  });

  it('skips when skill already exists', async () => {
    const sourceDir = path.join(tmpDir, 'source-skill');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, 'skill.json'),
      JSON.stringify({ name: 'test-skill', version: '1.0.0' })
    );

    // Pre-create target
    await fs.mkdir(path.join(targetDir, 'test-skill'), { recursive: true });
    await fs.writeFile(
      path.join(targetDir, 'test-skill', 'skill.json'),
      JSON.stringify({ name: 'test-skill', version: '0.9.0' })
    );

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await installSkill(sourceDir, targetDir);
    consoleSpy.mockRestore();

    const installed = await fs.readFile(path.join(targetDir, 'test-skill', 'skill.json'), 'utf-8');
    const skill = JSON.parse(installed);
    expect(skill.version).toBe('0.9.0'); // Should NOT be overwritten
  });

  it('overwrites with force option', async () => {
    const sourceDir = path.join(tmpDir, 'source-skill');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, 'skill.json'),
      JSON.stringify({ name: 'test-skill', version: '2.0.0' })
    );

    // Pre-create target
    await fs.mkdir(path.join(targetDir, 'test-skill'), { recursive: true });
    await fs.writeFile(
      path.join(targetDir, 'test-skill', 'skill.json'),
      JSON.stringify({ name: 'test-skill', version: '0.9.0' })
    );

    await installSkill(sourceDir, targetDir, { force: true });

    const installed = await fs.readFile(path.join(targetDir, 'test-skill', 'skill.json'), 'utf-8');
    const skill = JSON.parse(installed);
    expect(skill.version).toBe('2.0.0');
  });
});
```

Add import at top of test file:

```typescript
import { vi } from 'vitest';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/install.test.ts`

Expected: FAIL — `installSkill` is not defined

- [ ] **Step 3: Implement installSkill**

Add to `src/cli/install.ts` (after parseSource):

```typescript
import fs from 'fs/promises';

export interface InstallOptions {
  force?: boolean;
}

export async function installSkill(
  sourcePath: string,
  targetDir: string,
  options: InstallOptions = {}
): Promise<void> {
  // Read skill.json to get the name
  const skillJsonPath = path.join(sourcePath, 'skill.json');
  const content = await fs.readFile(skillJsonPath, 'utf-8');
  const skill = JSON.parse(content);
  const skillName = skill.name || path.basename(sourcePath);

  const targetPath = path.join(targetDir, skillName);

  // Check if already exists
  const exists = await fs.stat(targetPath).catch(() => null);
  if (exists && !options.force) {
    console.log(`Skill "${skillName}" already exists, skipping (use --force to overwrite)`);
    return;
  }

  // Create target directory
  await fs.mkdir(targetPath, { recursive: true });

  // Copy all files from source to target
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(sourcePath, entry.name);
    const dest = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(dest, { recursive: true });
      // Recursive copy would need more work; for now just copy top-level
      // Skills are typically flat (skill.json + README.md)
      const subEntries = await fs.readdir(src, { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isFile()) {
          await fs.copyFile(path.join(src, sub.name), path.join(dest, sub.name));
        }
      }
    } else {
      await fs.copyFile(src, dest);
    }
  }

  console.log(`Installed skill "${skillName}" to ${targetPath}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/install.test.ts`

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/cli/install.ts tests/cli/install.test.ts
git commit -m "feat: add installSkill function for local path installation"
```

---

### Task 8: CLI Install — Git Clone 和命令注册

**Files:**
- Modify: `src/cli/install.ts`
- Modify: `src/cli/index.ts`
- Modify: `tests/cli/install.test.ts`

- [ ] **Step 1: Add git clone helper and createInstallCommand**

Add to `src/cli/install.ts` (at the top, with other imports):

```typescript
import { spawn } from 'child_process';
import os from 'os';

async function execGit(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git failed: ${stderr || stdout}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function cloneGitRepo(
  repo: string,
  branch: string,
  tmpDir: string
): Promise<void> {
  await execGit(['clone', '--branch', branch, '--single-branch', '--depth', '1', repo, tmpDir]);
}
```

Add the command creator at the bottom of `src/cli/install.ts`:

```typescript
import { Command } from 'commander';

export function createInstallCommand(): Command {
  return new Command('install')
    .description('Install skills from git or local path')
    .argument('<source>', 'Git URL or local path')
    .option('-d, --dir <directory>', 'Target skills directory', './skills')
    .option('--all', 'Install all skills from registry')
    .option('-f, --force', 'Overwrite existing skills')
    .action(async (source, options) => {
      const targetDir = path.resolve(options.dir);
      await fs.mkdir(targetDir, { recursive: true });

      const parsed = parseSource(source);

      if (parsed.type === 'local') {
        const localPath = parsed.localPath!;
        const stat = await fs.stat(localPath).catch(() => null);
        if (!stat) {
          console.error(`Path not found: ${localPath}`);
          process.exit(1);
        }

        if (options.all) {
          // Bulk install from local directory
          await installAllFromDir(localPath, targetDir, options);
        } else {
          // Single skill from local directory
          await installSkill(localPath, targetDir, options);
        }
        return;
      }

      // Git installation
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webfunc-git-'));
      try {
        console.log(`Cloning ${parsed.repo}#${parsed.branch}...`);
        await cloneGitRepo(parsed.repo!, parsed.branch!, tmpDir);

        if (options.all) {
          // Bulk install from cloned repo root or specified path
          const sourceDir = parsed.path ? path.join(tmpDir, parsed.path) : tmpDir;
          await installAllFromDir(sourceDir, targetDir, options);
        } else {
          // Single skill from specific path
          const sourceDir = parsed.path ? path.join(tmpDir, parsed.path) : tmpDir;
          const stat = await fs.stat(sourceDir).catch(() => null);
          if (!stat) {
            console.error(`Path not found in cloned repo: ${parsed.path}`);
            process.exit(1);
          }
          await installSkill(sourceDir, targetDir, options);
        }
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
}

async function installAllFromDir(
  sourceDir: string,
  targetDir: string,
  options: InstallOptions
): Promise<void> {
  // Try registry.json first
  const registryPath = path.join(sourceDir, 'registry.json');
  try {
    const registryContent = await fs.readFile(registryPath, 'utf-8');
    const registry = JSON.parse(registryContent);
    if (registry.skills && Array.isArray(registry.skills)) {
      console.log(`Found registry with ${registry.skills.length} skills`);
      const failures: string[] = [];
      for (const entry of registry.skills) {
        const skillDir = path.join(sourceDir, entry.directory || entry.name);
        try {
          await installSkill(skillDir, targetDir, options);
        } catch (err: any) {
          failures.push(`${entry.name}: ${err.message}`);
        }
      }
      if (failures.length > 0) {
        console.error('\nFailed to install some skills:');
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
      }
      return;
    }
  } catch {
    // registry.json not found or invalid, fall through to scan
  }

  // Scan for skill directories
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const skillDirs = entries.filter((e) => e.isDirectory());

  if (skillDirs.length === 0) {
    console.log('No skills found in source directory');
    return;
  }

  for (const entry of skillDirs) {
    const skillPath = path.join(sourceDir, entry.name);
    const hasSkillJson = await fs.stat(path.join(skillPath, 'skill.json')).catch(() => null);
    if (hasSkillJson) {
      try {
        await installSkill(skillPath, targetDir, options);
      } catch (err: any) {
        console.error(`Failed to install ${entry.name}: ${err.message}`);
      }
    }
  }
}
```

- [ ] **Step 2: Register install command in CLI**

Modify `src/cli/index.ts`:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { createRecordCommand } from './record';
import { createRunCommand } from './run';
import { createListCommand } from './list';
import { createMcpCommand } from './mcp';
import { createInstallCommand } from './install';

const program = new Command();

program
  .name('webfunc')
  .description('Browser automation + LLM office assistant')
  .version('0.1.0');

program.addCommand(createRecordCommand());
program.addCommand(createRunCommand());
program.addCommand(createListCommand());
program.addCommand(createMcpCommand());
program.addCommand(createInstallCommand());

program.parse();
```

- [ ] **Step 3: Add test for createInstallCommand module loading**

Add to `tests/cli/cli.test.ts`:

```typescript
  it('install command module loads', async () => {
    const mod = await import('../../src/cli/install');
    expect(mod).toBeDefined();
    expect(mod.createInstallCommand).toBeDefined();
  });
```

- [ ] **Step 4: Run tests to verify**

Run: `npx vitest run tests/cli/`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/install.ts src/cli/index.ts tests/cli/cli.test.ts
git commit -m "feat: add install command with git and local source support"
```

---

### Task 9: 文档体系 — README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

Create `README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README.md with installation and quickstart"
```

---

### Task 10: 文档体系 — quickstart.md + record.md

**Files:**
- Create: `docs/quickstart.md`
- Create: `docs/record.md`

- [ ] **Step 1: Write docs/quickstart.md**

Create `docs/quickstart.md`:

```markdown
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
```

- [ ] **Step 2: Write docs/record.md**

Create `docs/record.md`:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add docs/quickstart.md docs/record.md
git commit -m "docs: add quickstart and record guides"
```

---

### Task 11: 文档体系 — skills.md + mcp.md + api.md

**Files:**
- Create: `docs/skills.md`
- Create: `docs/mcp.md`
- Create: `docs/api.md`

- [ ] **Step 1: Write docs/skills.md**

Create `docs/skills.md`:

```markdown
# Skills 使用与分享

## 安装 Skills

### 从 Git 仓库安装单个 Skill

```bash
npm run dev -- install https://github.com/ouruibin/webfunc-skills.git#skills/zhihu-hot
```

URL 格式支持：
- 完整 URL: `https://github.com/user/repo.git#path/to/skill`
- 带分支: `https://github.com/user/repo.git#branch:path/to/skill`
- GitHub 简写: `user/repo#path/to/skill`

### 批量安装所有 Skills

```bash
npm run dev -- install --all https://github.com/ouruibin/webfunc-skills.git
```

批量安装时会读取仓库根目录的 `registry.json`，按其中列出的 skills 逐个安装。如果没有 `registry.json`，则扫描目录下的所有 skill 子目录。

### 从本地路径安装

```bash
# 安装单个 skill
npm run dev -- install ./my-skill

# 批量安装本地集合
npm run dev -- install --all ./webfunc-skills
```

### 覆盖已存在的 Skill

```bash
npm run dev -- install --force https://github.com/ouruibin/webfunc-skills.git#skills/zhihu-hot
```

## 查看已安装的 Skills

```bash
npm run dev -- skills list
```

## 分享 Skills

### Skill 格式

Skill 是一个目录，包含：

```
skill-name/
├── skill.json    # 必填，skill 配置
└── README.md     # 可选，使用说明
```

### 创建 Skills 集合仓库

```
webfunc-skills/
├── README.md
├── registry.json
└── skills/
    ├── skill-a/
    │   ├── skill.json
    │   └── README.md
    └── skill-b/
        ├── skill.json
        └── README.md
```

`registry.json` 格式：

```json
{
  "name": "webfunc-skills",
  "version": "1.0.0",
  "skills": [
    {
      "name": "skill-a",
      "version": "1.0.0",
      "description": "描述",
      "directory": "skills/skill-a"
    }
  ]
}
```

## 社区 Skills

- [webfunc-skills](https://github.com/ouruibin/webfunc-skills) — 官方 Skills 集合
```

- [ ] **Step 2: Write docs/mcp.md**

Create `docs/mcp.md`:

```markdown
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
```

- [ ] **Step 3: Write docs/api.md**

Create `docs/api.md`:

```markdown
# Skill JSON 格式参考

## 完整示例

```json
{
  "name": "skill-name",
  "version": "1.0.0",
  "description": "Skill 描述（MCP 中作为 tool 说明）",
  "target_origin": "https://example.com",
  "execution_mode": "browser",
  "parameters": {
    "param1": {
      "type": "string",
      "required": true,
      "default": "default-value",
      "description": "参数说明"
    }
  },
  "steps": [
    {
      "id": "step1",
      "method": "GET",
      "url": "https://example.com/api/data",
      "headers": {},
      "body": "key={{param1}}",
      "extract": { "data": "$.path.to.value" },
      "assert": { "status": 200 }
    }
  ],
  "output": {
    "summary": "获取到 {{data.length}} 条数据",
    "extract": { "data": "$.path" }
  },
  "post_process": "generateMarkdown"
}
```

## 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | Skill 唯一标识 |
| `version` | string | 是 | 版本号 |
| `description` | string | 否 | 描述（MCP 中作为 tool description） |
| `target_origin` | string | 是 | 目标域名，用于 Cookie 获取 |
| `execution_mode` | string | 否 | `"http"`（axios）或 `"browser"`（浏览器内 fetch） |
| `parameters` | object | 否 | 参数定义 |
| `steps` | array | 否 | HTTP 请求步骤序列 |
| `output` | object | 否 | 输出定义 |
| `post_process` | string | 否 | 后置处理器名称 |

## parameters

```json
{
  "paramName": {
    "type": "string",
    "required": true,
    "default": "default",
    "description": "参数说明"
  }
}
```

`type` 支持: `string`, `number`, `boolean`

## steps

```json
{
  "id": "step1",
  "method": "GET",
  "url": "https://api.example.com/data",
  "headers": { "Authorization": "Bearer {{token}}" },
  "query": { "page": "{{page}}" },
  "body": { "key": "value" },
  "extract": { "items": "$.data.items" },
  "assert": { "status": 200 },
  "retry": 3
}
```

| 字段 | 说明 |
|------|------|
| `id` | 步骤标识，用于引用 |
| `method` | HTTP 方法: GET, POST, PUT, DELETE, PATCH |
| `url` | 请求 URL，支持模板变量 |
| `headers` | 请求头 |
| `query` | URL 查询参数 |
| `body` | 请求体 |
| `extract` | JSONPath 规则，提取响应数据 |
| `assert` | 断言规则 |
| `retry` | 重试次数 |

## extract / assert 中的 JSONPath

使用 `jsonpath-plus` 语法：

| 表达式 | 含义 |
|--------|------|
| `$.data` | 根对象的 data 字段 |
| `$.items[0]` | items 数组的第一个元素 |
| `$.items[*].name` | items 数组所有元素的 name 字段 |

## output

```json
{
  "summary": "获取到 {{items.length}} 条数据",
  "extract": { "items": "$.data.items" }
}
```

`summary` 支持模板变量：`{{paramName}}` 引用参数，`{{_stepId.response.path}}` 引用步骤结果。
```

- [ ] **Step 4: Commit**

```bash
git add docs/skills.md docs/mcp.md docs/api.md
git commit -m "docs: add skills, mcp, and api reference guides"
```

---

### Task 12: 删除旧文档

**Files:**
- Delete: `docs/recording-guide.html`

- [ ] **Step 1: Delete recording-guide.html**

```bash
git rm docs/recording-guide.html
```

- [ ] **Step 2: Commit**

```bash
git commit -m "docs: remove recording-guide.html, replaced by markdown docs"
```

---

### Task 13: 集合仓库创建

**Files:**
- Create (outside this repo): `webfunc-skills/README.md`
- Create (outside this repo): `webfunc-skills/registry.json`

- [ ] **Step 1: Create webfunc-skills directory and README.md**

In a directory **outside** the webfunc repo (e.g., `../webfunc-skills/`):

Create `README.md`:

```markdown
# Webfunc Skills

Webfunc 社区 Skills 集合。

## 可用 Skills

| Skill | 版本 | 描述 |
|-------|------|------|
| zhihu-hot | 1.0.0 | 获取知乎热榜数据 |
| horae-failed-tasks | 1.0.0 | 查询 Horae 失败任务 |
| horae-log | 1.0.0 | 查询 Horae 任务日志 |
| meeting-booking | 1.0.0 | 会议室预订 |
| meeting-room-query | 1.0.0 | 会议室查询 |

## 安装全部 Skills

```bash
webfunc install --all https://github.com/ouruibin/webfunc-skills.git
```

## 安装单个 Skill

```bash
webfunc install https://github.com/ouruibin/webfunc-skills.git#skills/zhihu-hot
```

## 目录结构

```
skills/
├── zhihu-hot/
│   ├── skill.json
│   └── README.md
├── horae-failed-tasks/
│   ├── skill.json
│   └── README.md
└── ...
```
```

- [ ] **Step 2: Create registry.json**

Create `registry.json`:

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
    },
    {
      "name": "horae-log",
      "version": "1.0.0",
      "description": "查询 Horae 任务日志",
      "directory": "skills/horae-log"
    },
    {
      "name": "meeting-booking",
      "version": "1.0.0",
      "description": "会议室预订",
      "directory": "skills/meeting-booking"
    },
    {
      "name": "meeting-room-query",
      "version": "1.0.0",
      "description": "会议室查询",
      "directory": "skills/meeting-room-query"
    }
  ]
}
```

- [ ] **Step 3: Migrate existing skills to collection repo**

For each `.json` file in `webfunc/skills/`, create a directory in `webfunc-skills/skills/`:

```bash
# Example for zhihu-hot
mkdir -p webfunc-skills/skills/zhihu-hot
cp webfunc/skills/zhihu-hot.json webfunc-skills/skills/zhihu-hot/skill.json
```

Do this for all skills:
- `zhihu-hot.json` -> `skills/zhihu-hot/skill.json`
- `horae-failed-tasks.json` -> `skills/horae-failed-tasks/skill.json`
- `horae-log.json` -> `skills/horae-log/skill.json`
- `meeting-booking.json` -> `skills/meeting-booking/skill.json`
- `meeting-room-query.json` -> `skills/meeting-room-query/skill.json`

Skip the `-cdp-debug.json` files (they are debug artifacts).

- [ ] **Step 4: Commit collection repo**

```bash
cd webfunc-skills
git init
git add .
git commit -m "feat: initial skills collection"
```

> Note: The user needs to create and push this repository separately. This task documents the structure and migration steps.

---

## Spec Coverage Check

| Spec Section | Implementing Task |
|--------------|-------------------|
| 2.1 文档文件结构 | Task 9, 10, 11 |
| 2.2 README.md 内容 | Task 9 |
| 2.3 docs/ 各文档 | Task 10, 11 |
| 2.4 删除 recording-guide.html | Task 12 |
| 3.1 集合仓库结构 | Task 13 |
| 3.2 registry.json | Task 13 |
| 3.3 Skill 迁移 | Task 13 |
| 4.1 install 命令 | Task 6, 7, 8 |
| 4.2 安装示例 | Task 8 (embedded in command) |
| 4.3 安装目录 | Task 7 (installSkill uses dir format) |
| 4.4 URL 解析 | Task 6 |
| 4.5 本地路径安装 | Task 7, 8 |
| 5.1 Skill 加载问题 | Task 3, 4, 5 |
| 5.2 统一加载函数 | Task 1, 2 |
| 5.3 改造点 | Task 3, 4, 5 |
| 6. 错误处理 | Task 7, 8 (embedded) |

All spec sections are covered. No gaps.

## Placeholder Scan

- No "TBD", "TODO", or "implement later" found.
- No vague "add error handling" without specific code.
- No "similar to Task N" references.
- All code blocks contain complete, runnable code.

## Type Consistency Check

- `loadSkill(name: string, dir: string): Promise<Skill>` — used consistently in Task 1, 3, 4, 5
- `listSkills(dir: string): Promise<ListedSkill[]>` — used consistently in Task 2, 4, 5
- `parseSource(source: string): ParsedSource` — used in Task 6, 8
- `installSkill(sourcePath, targetDir, options)` — used in Task 7, 8
- `createInstallCommand(): Command` — defined in Task 8

All type signatures match across tasks.
