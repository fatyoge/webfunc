import axios from 'axios';
import { JSONPath } from 'jsonpath-plus';
import { Skill, ExecutionContext, ExecutionResult, SkillStep } from '../types/skill';
import type { LoadedSkill } from './skill-loader';
import { renderSkillStep } from './template-renderer';
import { getPostProcessor } from './post-processors';

export class SkillExecutor {
  async run(loaded: LoadedSkill, context: ExecutionContext): Promise<ExecutionResult> {
    const { skill, module } = loaded;

    // 1. beforeRun 钩子
    if (module?.beforeRun) {
      await module.beforeRun(context);
    }

    const stepResults: ExecutionContext['stepResults'] = {};
    const extractedValues: Record<string, unknown> = {};

    const mode = skill.execution_mode || 'http';

    // 2. 执行 steps
    for (const step of skill.steps || []) {
      const renderContext: ExecutionContext = {
        ...context,
        stepResults,
        params: { ...context.params, ...extractedValues },
        skillPath: loaded.path,
      };
      const renderedStep = renderSkillStep(step, renderContext);

      try {
        const response = module?.executeStep
          ? await module.executeStep(renderedStep, renderContext)
          : mode === 'browser' && context.page
            ? await this.runBrowserStep(renderedStep, context.page)
            : await this.runHttpStep(renderedStep, context.cookies);

        if (step.assert) {
          const assertError = this.validateAssertion(response.status, response.data, step.assert);
          if (assertError) {
            const errorResult: ExecutionResult = {
              success: false,
              summary: '',
              extracted: {},
              error: `Assertion failed on step "${step.id}": ${assertError}`,
            };
            if (module?.afterRun) {
              await module.afterRun(errorResult, { ...renderContext, skillPath: loaded.path });
            }
            return errorResult;
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
        const errorResult: ExecutionResult = {
          success: false,
          summary: '',
          extracted: {},
          error: `Request failed on step "${step.id}": ${error.message}`,
        };
        if (module?.afterRun) {
          await module.afterRun(errorResult, { ...renderContext, skillPath: loaded.path });
        }
        return errorResult;
      }
    }

    const finalContext: ExecutionContext = {
      ...context,
      stepResults,
      params: { ...context.params, ...extractedValues },
      skillPath: loaded.path,
    };

    // 3. 生成基础 result
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

    let result: ExecutionResult = {
      success: true,
      summary: renderedOutput.url,
      extracted,
    };

    // 4. postProcess 钩子（优先用模块的，否则回退到内置处理器）
    if (module?.postProcess) {
      result = await module.postProcess(result, finalContext);
    } else if (skill.post_process) {
      const processor = getPostProcessor(skill.post_process);
      if (processor) {
        result = await processor(result, skill);
      }
    }

    // 5. afterRun 钩子
    if (module?.afterRun) {
      await module.afterRun(result, finalContext);
    }

    return result;
  }

  private async runHttpStep(
    step: SkillStep,
    cookies: string
  ): Promise<{ status: number; data: unknown }> {
    const response = await axios.request({
      method: step.method,
      url: step.url,
      headers: {
        ...step.headers,
        Cookie: cookies,
      },
      data: step.body,
      params: step.query,
    });

    return { status: response.status, data: response.data };
  }

  private async runBrowserStep(
    step: SkillStep,
    page: import('playwright').Page
  ): Promise<{ status: number; data: unknown }> {
    const fetchArgs = {
      url: step.url,
      method: step.method,
      headers: step.headers || {},
      body: typeof step.body === 'string' ? step.body : step.body ? JSON.stringify(step.body) : null,
    };

    const result = await page.evaluate(async (args) => {
      const options: RequestInit = {
        method: args.method,
        headers: args.headers,
        credentials: 'include',
      };
      if (args.body && args.method !== 'GET') {
        options.body = args.body;
      }

      const res = await fetch(args.url, options);
      const text = await res.text();

      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const tables = Array.from(doc.querySelectorAll('table'));
        if (tables.length > 0) {
          let bestTable: HTMLTableElement | null = null;
          let bestRows = 0;
          for (const t of tables) {
            const rows = t.querySelectorAll('tr').length;
            if (rows > bestRows) {
              bestRows = rows;
              bestTable = t;
            }
          }
          if (bestTable && bestRows > 1) {
            const headers = Array.from(bestTable.querySelectorAll('th')).map((h) => h.textContent?.trim() || '');
            const rows = Array.from(bestTable.querySelectorAll('tr')).slice(1).map((row) => {
              const cells = Array.from(row.querySelectorAll('td')).map((c) => {
                const text = c.textContent?.trim() || '';
                const links = Array.from(c.querySelectorAll('a')).map((a) => ({
                  text: a.textContent?.trim() || '',
                  href: a.getAttribute('href') || '',
                  onclick: a.getAttribute('onclick') || '',
                }));
                return links.length > 0 ? { text, links } : text;
              });
              const obj: Record<string, unknown> = {};
              cells.forEach((cell, i) => {
                obj[headers[i] || `col${i}`] = cell;
              });
              return obj;
            });
            data = { headers, rows };
          }
        }
      }

      return {
        status: res.status,
        data,
        contentType: res.headers.get('content-type') || '',
      };
    }, fetchArgs);

    return { status: result.status, data: result.data };
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
