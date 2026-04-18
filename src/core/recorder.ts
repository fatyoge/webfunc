import { BrowserContext } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { Skill, SkillStep } from '../types/skill';

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
}

export class SkillRecorder {
  private requests: Map<string, RecordedRequest> = new Map();
  private targetOrigin: string = '';
  private outputDir: string;

  constructor(outputDir: string = './skills') {
    this.outputDir = outputDir;
  }

  async start(context: BrowserContext, targetOrigin: string): Promise<void> {
    this.targetOrigin = targetOrigin;
    this.requests.clear();

    const pages = context.pages();
    for (const page of pages) {
      page.on('request', (request) => {
        const url = request.url();
        if (!url.startsWith(targetOrigin)) return;
        if (this.isStaticAsset(url)) return;

        this.requests.set(request.url(), {
          url,
          method: request.method(),
          headers: request.headers(),
          body: request.postData() || undefined,
        });
      });

      page.on('response', async (response) => {
        const url = response.request().url();
        const recorded = this.requests.get(url);
        if (!recorded) return;

        try {
          const body = await response.json();
          recorded.responseStatus = response.status();
          recorded.responseHeaders = response.headers();
          recorded.responseBody = body;
        } catch {
          // Ignore non-JSON responses
        }
      });
    }
  }

  async stop(skillName: string): Promise<Skill> {
    const steps: SkillStep[] = [];
    let stepIndex = 0;

    for (const req of this.requests.values()) {
      if (!req.responseStatus) continue;

      const url = new URL(req.url);

      const step: SkillStep = {
        id: `step_${stepIndex}`,
        method: req.method as SkillStep['method'],
        url: req.url,
        headers: this.filterHeaders(req.headers),
      };

      if (req.body) {
        try {
          step.body = JSON.parse(req.body);
        } catch {
          step.body = req.body;
        }
      }

      if (url.searchParams.size > 0) {
        step.query = {};
        for (const [key, value] of url.searchParams) {
          step.query[key] = this.detectParam(value);
        }
      }

      steps.push(step);
      stepIndex++;
    }

    const skill: Skill = {
      name: skillName,
      version: '1.0.0',
      target_origin: this.targetOrigin,
      parameters: {},
      steps,
      output: { summary: `Executed ${skillName}` },
    };

    await mkdir(this.outputDir, { recursive: true });
    await writeFile(
      `${this.outputDir}/${skillName}.json`,
      JSON.stringify(skill, null, 2)
    );

    return skill;
  }

  private isStaticAsset(url: string): boolean {
    const extensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2'];
    return extensions.some((ext) => url.endsWith(ext));
  }

  private filterHeaders(headers: Record<string, string>): Record<string, string> {
    const skip = ['cookie', 'host', 'connection', 'content-length'];
    return Object.fromEntries(
      Object.entries(headers).filter(([k]) => !skip.includes(k.toLowerCase()))
    );
  }

  private detectParam(value: string): string {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}T/;

    if (datePattern.test(value)) return `{{date}}`;
    if (isoDatePattern.test(value)) return `{{datetime}}`;
    return value;
  }
}
