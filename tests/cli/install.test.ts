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
