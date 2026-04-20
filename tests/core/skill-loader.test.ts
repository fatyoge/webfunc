import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadSkill } from '../../src/core/skill-loader';
import { Skill } from '../../src/types/skill';

describe('loadSkill', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-loader-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('loads skill from directory format', async () => {
    const skillDir = path.join(tempDir, 'my-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skill: Skill = {
      name: 'my-skill',
      version: '1.0.0',
      target_origin: 'https://api.example.com',
      parameters: {},
      steps: [],
      output: { summary: 'Done' },
    };
    await fs.writeFile(path.join(skillDir, 'skill.json'), JSON.stringify(skill));

    const result = await loadSkill('my-skill', tempDir);
    expect(result).toEqual(skill);
  });

  it('loads skill from file format (fallback)', async () => {
    const skill: Skill = {
      name: 'my-skill',
      version: '1.0.0',
      target_origin: 'https://api.example.com',
      parameters: {},
      steps: [],
      output: { summary: 'Done' },
    };
    await fs.writeFile(path.join(tempDir, 'my-skill.json'), JSON.stringify(skill));

    const result = await loadSkill('my-skill', tempDir);
    expect(result).toEqual(skill);
  });

  it('prefers directory format over file format when both exist', async () => {
    const skillDir = path.join(tempDir, 'my-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const dirSkill: Skill = {
      name: 'my-skill-dir',
      version: '2.0.0',
      target_origin: 'https://api.example.com',
      parameters: {},
      steps: [],
      output: { summary: 'From directory' },
    };
    const fileSkill: Skill = {
      name: 'my-skill-file',
      version: '1.0.0',
      target_origin: 'https://api.example.com',
      parameters: {},
      steps: [],
      output: { summary: 'From file' },
    };
    await fs.writeFile(path.join(skillDir, 'skill.json'), JSON.stringify(dirSkill));
    await fs.writeFile(path.join(tempDir, 'my-skill.json'), JSON.stringify(fileSkill));

    const result = await loadSkill('my-skill', tempDir);
    expect(result).toEqual(dirSkill);
  });

  it('throws when skill not found', async () => {
    await expect(loadSkill('nonexistent', tempDir)).rejects.toThrow(
      'Skill "nonexistent" not found in ' + tempDir
    );
  });

  it('throws on malformed JSON in directory format', async () => {
    const skillDir = path.join(tempDir, 'bad-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'skill.json'), 'not json');

    await expect(loadSkill('bad-skill', tempDir)).rejects.toThrow(SyntaxError);
  });
});

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
