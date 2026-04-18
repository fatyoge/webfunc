import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillRecorder } from '../../src/core/recorder';
import { BrowserContext } from 'playwright';

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import { writeFile, mkdir } from 'fs/promises';

describe('SkillRecorder', () => {
  let mockContext: any;
  let mockPage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = {
      on: vi.fn(),
    };
    mockContext = {
      pages: () => [mockPage],
    };
  });

  it('records requests and generates skill.json', async () => {
    const recorder = new SkillRecorder('/tmp/skills');
    await recorder.start(mockContext as BrowserContext, 'https://api.example.com');

    const requestHandler = mockPage.on.mock.calls.find((call: any) => call[0] === 'request')?.[1];
    const responseHandler = mockPage.on.mock.calls.find((call: any) => call[0] === 'response')?.[1];

    expect(requestHandler).toBeDefined();
    expect(responseHandler).toBeDefined();

    const mockRequest = {
      url: () => 'https://api.example.com/rooms',
      method: () => 'GET',
      headers: () => ({ 'Accept': 'application/json' }),
      postData: () => undefined,
    };
    const mockResponse = {
      request: () => mockRequest,
      status: () => 200,
      headers: () => ({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ rooms: [{ id: 'r1' }] }),
    };

    requestHandler(mockRequest);
    await responseHandler(mockResponse);

    const skill = await recorder.stop('test-skill');

    expect(mkdir).toHaveBeenCalledWith('/tmp/skills', { recursive: true });
    expect(writeFile).toHaveBeenCalled();
    expect(skill.name).toBe('test-skill');
    expect(skill.target_origin).toBe('https://api.example.com');
    expect(skill.steps.length).toBe(1);
    expect(skill.steps[0].method).toBe('GET');
    expect(skill.steps[0].url).toBe('https://api.example.com/rooms');
  });
});
