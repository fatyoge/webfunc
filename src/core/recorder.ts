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

interface CDPRequest {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
}

export class SkillRecorder {
  private requests: RecordedRequest[] = [];
  private cdpRequests: CDPRequest[] = [];
  private targetOrigin: string = '';
  private outputDir: string;

  constructor(outputDir: string = './skills') {
    this.outputDir = outputDir;
  }

  private attachPageListeners(page: import('playwright').Page): void {
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(this.targetOrigin)) return;
      if (this.isStaticAsset(url)) return;

      this.requests.push({
        url,
        method: request.method(),
        headers: request.headers(),
        body: request.postData() || undefined,
      });
    });

    page.on('response', async (response) => {
      const url = response.request().url();
      // Match the most recent pending request with same URL and method
      const recorded = [...this.requests]
        .reverse()
        .find((r) => r.url === url && !r.responseStatus);
      if (!recorded) return;

      recorded.responseStatus = response.status();
      recorded.responseHeaders = response.headers();

      try {
        const body = await response.json();
        recorded.responseBody = body;
      } catch {
        // Non-JSON response, still keep the request
      }
    });
  }

  private async attachCDPListeners(page: import('playwright').Page): Promise<void> {
    try {
      const session = await (page.context() as any).newCDPSession(page);
      await session.send('Network.enable');

      session.on('Network.requestWillBeSent', (params: any) => {
        const url = params.request.url;
        if (!url.startsWith(this.targetOrigin)) return;
        if (this.isStaticAsset(url)) return;

        this.cdpRequests.push({
          requestId: params.requestId,
          url,
          method: params.request.method,
          headers: params.request.headers,
          postData: params.request.postData,
        });
      });

      session.on('Network.responseReceived', async (params: any) => {
        const req = this.cdpRequests.find((r) => r.requestId === params.requestId);
        if (!req) return;

        req.responseStatus = params.response.status;
        req.responseHeaders = params.response.headers;

        try {
          const result = await session.send('Network.getResponseBody', {
            requestId: params.requestId,
          });
          if (result.body) {
            try {
              req.responseBody = JSON.parse(result.body);
            } catch {
              req.responseBody = result.base64Encoded ? '[base64]' : result.body;
            }
          }
        } catch {
          // Response body not available
        }
      });
    } catch (err) {
      console.warn('Failed to attach CDP listener:', err);
    }
  }

  async start(context: BrowserContext, targetOrigin: string): Promise<void> {
    this.targetOrigin = targetOrigin;
    this.requests = [];
    this.cdpRequests = [];

    // Attach to existing pages
    for (const page of context.pages()) {
      this.attachPageListeners(page);
      await this.attachCDPListeners(page);
    }

    // Attach to new pages created during recording
    context.on('page', async (page) => {
      this.attachPageListeners(page);
      await this.attachCDPListeners(page);
    });
  }

  async stop(skillName: string): Promise<Skill> {
    const steps: SkillStep[] = [];
    let stepIndex = 0;

    for (const req of this.requests) {
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

    // Write CDP debug log for comparison
    const cdpDebug = {
      playwrightCaptured: this.requests.length,
      playwrightUrls: this.requests.map((r) => ({ url: r.url, method: r.method, hasResponse: !!r.responseStatus })),
      cdpCaptured: this.cdpRequests.length,
      cdpUrls: this.cdpRequests.map((r) => ({ url: r.url, method: r.method, status: r.responseStatus })),
      onlyInCDP: this.cdpRequests
        .filter((c) => !this.requests.some((p) => p.url === c.url))
        .map((r) => ({ url: r.url, method: r.method })),
      onlyInPlaywright: this.requests
        .filter((p) => !this.cdpRequests.some((c) => c.url === p.url))
        .map((r) => ({ url: r.url, method: r.method })),
    };
    await writeFile(
      `${this.outputDir}/${skillName}-cdp-debug.json`,
      JSON.stringify(cdpDebug, null, 2)
    );
    console.log(`CDP debug log saved to ${this.outputDir}/${skillName}-cdp-debug.json`);
    console.log(`Playwright captured: ${cdpDebug.playwrightCaptured}, CDP captured: ${cdpDebug.cdpCaptured}`);
    if (cdpDebug.onlyInCDP.length > 0) {
      console.log(`Requests only in CDP (${cdpDebug.onlyInCDP.length}):`);
      cdpDebug.onlyInCDP.forEach((r) => console.log(`  - ${r.method} ${r.url}`));
    }

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
