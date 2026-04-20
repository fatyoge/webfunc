import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { installSkill } from '../../src/cli/install';

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
    expect(skill.version).toBe('0.9.0');
  });

  it('overwrites with force option', async () => {
    const sourceDir = path.join(tmpDir, 'source-skill');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, 'skill.json'),
      JSON.stringify({ name: 'test-skill', version: '2.0.0' })
    );

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
