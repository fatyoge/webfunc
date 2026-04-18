import axios from 'axios';
import { JSONPath } from 'jsonpath-plus';
import { Skill, ExecutionContext, SkillStep } from '../types/skill';
import { renderSkillStep } from './template-renderer';

export interface ExecutionResult {
  success: boolean;
  summary: string;
  extracted: Record<string, unknown>;
  error?: string;
}

export class SkillExecutor {
  async run(skill: Skill, context: ExecutionContext): Promise<ExecutionResult> {
    const stepResults: ExecutionContext['stepResults'] = {};
    const extractedValues: Record<string, unknown> = {};

    for (const step of skill.steps) {
      const renderContext: ExecutionContext = {
        ...context,
        stepResults,
        params: { ...context.params, ...extractedValues },
      };
      const renderedStep = renderSkillStep(step, renderContext);

      try {
        const response = await axios.request({
          method: renderedStep.method,
          url: renderedStep.url,
          headers: {
            ...renderedStep.headers,
            Cookie: context.cookies,
          },
          data: renderedStep.body,
          params: renderedStep.query,
        });

        if (step.assert) {
          const assertError = this.validateAssertion(response.status, response.data, step.assert);
          if (assertError) {
            return {
              success: false,
              summary: '',
              extracted: {},
              error: `Assertion failed on step "${step.id}": ${assertError}`,
            };
          }
        }

        stepResults[step.id] = {
          response: response.data,
          status: response.status,
        };

        if (step.extract) {
          for (const [key, path] of Object.entries(step.extract)) {
            const result = JSONPath({ path, json: response.data as object }) as unknown[];
            extractedValues[key] = result[0];
          }
        }
      } catch (error: any) {
        return {
          success: false,
          summary: '',
          extracted: {},
          error: `Request failed on step "${step.id}": ${error.message}`,
        };
      }
    }

    const finalContext: ExecutionContext = {
      ...context,
      stepResults,
      params: { ...context.params, ...extractedValues },
    };
    const renderedOutput = renderSkillStep(
      { id: 'output', method: 'GET', url: skill.output.summary, ...skill.output },
      finalContext
    );

    const extracted: Record<string, unknown> = {};
    if (skill.output.extract) {
      const lastResponse = Object.values(stepResults).pop()?.response;
      for (const [key, path] of Object.entries(skill.output.extract)) {
        const result = JSONPath({ path, json: lastResponse as object }) as unknown[];
        extracted[key] = result[0];
      }
    }

    return {
      success: true,
      summary: renderedOutput.url,
      extracted,
    };
  }

  private validateAssertion(status: number, data: unknown, assert: Record<string, unknown>): string | null {
    for (const [key, expected] of Object.entries(assert)) {
      if (key === 'status') {
        if (status !== expected) return `expected status ${expected}, got ${status}`;
      } else {
        const result = JSONPath({ path: key, json: data as object }) as unknown[];
        const actual = result[0];
        if (actual !== expected) return `expected ${key}=${expected}, got ${actual}`;
      }
    }
    return null;
  }
}
