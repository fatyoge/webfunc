import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { convertSkillToPackage, unpackageSkill, generateIndexTemplate } from '../../src/cli/package';
import type { Skill } from '../../src/types/skill';

describe('package command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'webfunc-package-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('should convert JSON skill to package format', async () => {
    const skill: Skill = {
      name: 'test-skill',
      version: '1.0.0',
      target_origin: 'https://example.com',
      parameters: {},
      steps: [],
      output: { summary: 'done' },
    };

    const jsonPath = path.join(testDir, 'test-skill.json');
    await fs.writeFile(jsonPath, JSON.stringify(skill, null, 2));

    const result = await convertSkillToPackage('test-skill', { dir: testDir, force: false });

    // 检查目录结构
    expect(result.packageDir).toBe(path.join(testDir, 'test-skill'));
    expect(result.skillJsonPath).toBe(path.join(testDir, 'test-skill', 'skill.json'));
    expect(result.indexPath).toBe(path.join(testDir, 'test-skill', 'index.ts'));

    // 检查 skill.json 内容
    const skillContent = await fs.readFile(result.skillJsonPath, 'utf-8');
    const parsed = JSON.parse(skillContent);
    expect(parsed.name).toBe('test-skill');

    // 检查 index.ts 已生成
    const indexContent = await fs.readFile(result.indexPath, 'utf-8');
    expect(indexContent).toContain('export default');
    expect(indexContent).toContain('postProcess');

    // 检查旧 JSON 已删除
    await expect(fs.access(jsonPath)).rejects.toThrow();
  });

  it('should throw if JSON does not exist', async () => {
    await expect(
      convertSkillToPackage('nonexistent', { dir: testDir, force: false })
    ).rejects.toThrow('Skill JSON 不存在');
  });

  it('should throw if package directory already exists without force', async () => {
    const skill: Skill = {
      name: 'existing',
      version: '1.0.0',
      target_origin: 'https://example.com',
      parameters: {},
      steps: [],
      output: { summary: 'done' },
    };

    const jsonPath = path.join(testDir, 'existing.json');
    await fs.writeFile(jsonPath, JSON.stringify(skill));
    await fs.mkdir(path.join(testDir, 'existing'), { recursive: true });

    await expect(
      convertSkillToPackage('existing', { dir: testDir, force: false })
    ).rejects.toThrow('目录已存在');
  });

  it('should overwrite with force flag', async () => {
    const skill: Skill = {
      name: 'overwrite',
      version: '1.0.0',
      target_origin: 'https://example.com',
      parameters: {},
      steps: [],
      output: { summary: 'done', extract: { items: '$.data' } },
    };

    const jsonPath = path.join(testDir, 'overwrite.json');
    await fs.writeFile(jsonPath, JSON.stringify(skill));
    await fs.mkdir(path.join(testDir, 'overwrite'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'overwrite', 'old.txt'), 'old');

    const result = await convertSkillToPackage('overwrite', { dir: testDir, force: true });

    const skillContent = await fs.readFile(result.skillJsonPath, 'utf-8');
    expect(JSON.parse(skillContent).name).toBe('overwrite');
  });

  it('should include extract keys in template comment', async () => {
    const skill: Skill = {
      name: 'extract-test',
      version: '1.0.0',
      target_origin: 'https://example.com',
      parameters: {},
      steps: [],
      output: { summary: 'done', extract: { users: '$.users', total: '$.total' } },
    };

    const template = generateIndexTemplate(skill);
    expect(template).toContain('// 提取字段: users, total');
    expect(template).toContain('// 可通过 result.extracted 访问');
  });

  describe('unpackage', () => {
    it('should revert package back to single JSON', async () => {
      const skill: Skill = {
        name: 'revert-test',
        version: '1.0.0',
        target_origin: 'https://example.com',
        parameters: {},
        steps: [],
        output: { summary: 'done' },
      };

      // 先打包
      const jsonPath = path.join(testDir, 'revert-test.json');
      await fs.writeFile(jsonPath, JSON.stringify(skill));
      await convertSkillToPackage('revert-test', { dir: testDir, force: false });

      // 再回退
      const result = await unpackageSkill('revert-test', { dir: testDir, force: false });

      // 检查 JSON 已恢复
      expect(result.jsonPath).toBe(jsonPath);
      const restored = await fs.readFile(jsonPath, 'utf-8');
      expect(JSON.parse(restored).name).toBe('revert-test');

      // 检查目录已删除
      await expect(fs.access(result.packageDir)).rejects.toThrow();
    });

    it('should throw if package directory does not exist', async () => {
      await expect(
        unpackageSkill('missing', { dir: testDir, force: false })
      ).rejects.toThrow('Skill Package 不存在');
    });

    it('should throw if JSON already exists without force', async () => {
      const skill: Skill = {
        name: 'collision',
        version: '1.0.0',
        target_origin: 'https://example.com',
        parameters: {},
        steps: [],
        output: { summary: 'done' },
      };

      // 打包
      await fs.writeFile(path.join(testDir, 'collision.json'), JSON.stringify(skill));
      await convertSkillToPackage('collision', { dir: testDir, force: false });

      // 创建冲突的 JSON
      await fs.writeFile(path.join(testDir, 'collision.json'), '{}');

      await expect(
        unpackageSkill('collision', { dir: testDir, force: false })
      ).rejects.toThrow('JSON 已存在');
    });

    it('should overwrite with force on unpackage', async () => {
      const skill: Skill = {
        name: 'force-revert',
        version: '1.0.0',
        target_origin: 'https://example.com',
        parameters: {},
        steps: [],
        output: { summary: 'done' },
      };

      await fs.writeFile(path.join(testDir, 'force-revert.json'), JSON.stringify(skill));
      await convertSkillToPackage('force-revert', { dir: testDir, force: false });

      // 创建冲突的 JSON
      await fs.writeFile(path.join(testDir, 'force-revert.json'), '{}');

      const result = await unpackageSkill('force-revert', { dir: testDir, force: true });

      const restored = await fs.readFile(result.jsonPath, 'utf-8');
      expect(JSON.parse(restored).name).toBe('force-revert');
    });
  });
});
