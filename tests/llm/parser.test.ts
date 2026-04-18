import { describe, it, expect, vi } from 'vitest';
import { LLMParser } from '../../src/llm/parser';
import { Skill } from '../../src/types/skill';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              date: '2024-06-15',
              start_time: '14:00',
              capacity: 5,
            }),
          },
        ],
      }),
    },
  })),
}));

describe('LLMParser', () => {
  it('parses natural language into Skill parameters', async () => {
    const skill: Skill = {
      name: 'book-room',
      version: '1.0.0',
      target_origin: 'https://meeting.example.com',
      parameters: {
        date: { type: 'string', required: true },
        start_time: { type: 'string', required: true },
        capacity: { type: 'number', required: true },
      },
      steps: [],
      output: { summary: '' },
    };

    const parser = new LLMParser({ apiKey: 'test-key' });
    const result = await parser.parse('Book a room for June 15th at 2pm for 5 people', skill);

    expect(result).toEqual({
      date: '2024-06-15',
      start_time: '14:00',
      capacity: 5,
    });
  });
});
