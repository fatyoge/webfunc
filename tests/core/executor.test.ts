import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillExecutor } from '../../src/core/executor';
import { Skill, ExecutionContext } from '../../src/types/skill';

vi.mock('axios');
import axios from 'axios';

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
    const result = await executor.run(skill, context);

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
    const result = await executor.run(skill, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Assertion failed');
  });
});
