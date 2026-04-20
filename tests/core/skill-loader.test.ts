import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
});
