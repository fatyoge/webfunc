import { describe, it, expect } from 'vitest';
import { renderTemplate, renderSkillStep } from '../../src/core/template-renderer';
import { ExecutionContext } from '../../src/types/skill';

describe('renderTemplate', () => {
  it('replaces simple parameters', () => {
    const result = renderTemplate('Hello {{name}}!', { name: 'Alice' });
    expect(result).toBe('Hello Alice!');
  });

  it('leaves unknown placeholders intact', () => {
    const result = renderTemplate('Hello {{unknown}}!', { name: 'Alice' });
    expect(result).toBe('Hello {{unknown}}!');
  });

  it('replaces multiple placeholders', () => {
    const result = renderTemplate('{{greeting}} {{name}}!', { greeting: 'Hi', name: 'Bob' });
    expect(result).toBe('Hi Bob!');
  });
});

describe('renderSkillStep', () => {
  it('renders step with params and step references', () => {
    const context: ExecutionContext = {
      params: { date: '2024-01-15' },
      stepResults: {
        query: {
          response: { data: { rooms: [{ id: 'room-1' }] } },
          status: 200,
        },
      },
      cookies: '',
    };

    const step = {
      id: 'book',
      method: 'POST' as const,
      url: 'https://api.example.com/book',
      body: {
        date: '{{date}}',
        roomId: '{{_query.response.data.rooms[0].id}}',
      },
    };

    const result = renderSkillStep(step, context);
    expect(result.url).toBe('https://api.example.com/book');
    expect(result.body).toEqual({ date: '2024-01-15', roomId: 'room-1' });
  });
});
