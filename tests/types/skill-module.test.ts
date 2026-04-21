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
