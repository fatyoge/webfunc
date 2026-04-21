import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillExecutor } from '../../src/core/executor';
import { Skill, ExecutionContext } from '../../src/types/skill';
import type { LoadedSkill } from '../../src/core/skill-loader';

vi.mock('axios');
import axios from 'axios';

function wrapSkill(skill: Skill): LoadedSkill {
  return {
    name: skill.name,
    path: '/tmp',
    skill,
  };
}

describe('SkillExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a single GET step successfully', async () => {
    (axios.request as any).mockResolvedValue({
      status: 200,
      data: { rooms: [{ id: 'r1', name: 'Room A' }] },
      headers: {},
    });

    const skill: Skill = {
      name: 'test-skill',
      version: '1.0.0',
      target_origin: 'https://api.example.com',
      parameters: {},
      steps: [
        {
          id: 'list',
          method: 'GET',
          url: 'https://api.example.com/rooms',
          extract: { roomId: '$.rooms[0].id' },
        },
      ],
      output: { summary: 'Found room {{roomId}}', extract: { roomId: '$.rooms[0].id' } },
    };

    const context: ExecutionContext = {
      params: {},
      stepResults: {},
      cookies: 'session=abc',
    };

    const executor = new SkillExecutor();
    const result = await executor.run(wrapSkill(skill), context);

    expect(axios.request).toHaveBeenCalledWith({
      method: 'GET',
      url: 'https://api.example.com/rooms',
      headers: { Cookie: 'session=abc' },
      data: undefined,
      params: undefined,
    });
    expect(result.success).toBe(true);
    expect(result.summary).toBe('Found room r1');
    expect(result.extracted).toEqual({ roomId: 'r1' });
  });

  it('fails when assertion does not match', async () => {
    (axios.request as any).mockResolvedValue({
      status: 500,
      data: { error: 'Server error' },
      headers: {},
    });

    const skill: Skill = {
      name: 'test-skill',
      version: '1.0.0',
      target_origin: 'https://api.example.com',
      parameters: {},
      steps: [
        {
          id: 'query',
          method: 'GET',
          url: 'https://api.example.com/data',
          assert: { status: 200 },
        },
      ],
      output: { summary: 'Done' },
    };

    const context: ExecutionContext = {
      params: {},
      stepResults: {},
      cookies: '',
    };

    const executor = new SkillExecutor();
    const result = await executor.run(wrapSkill(skill), context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Assertion failed');
  });
});

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
