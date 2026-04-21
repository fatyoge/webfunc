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
    const loaded = await loader.loadFromPath(path.join(testDir, 'test-skill.json'));
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
