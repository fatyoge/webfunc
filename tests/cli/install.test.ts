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
