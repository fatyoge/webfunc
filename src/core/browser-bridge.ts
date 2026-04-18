import { chromium, BrowserContext } from 'playwright';

export interface BrowserBridgeOptions {
  cdpEndpoint?: string;
  userDataDir?: string;
  headless?: boolean;
}

export class BrowserBridge {
  private context: BrowserContext | null = null;
  private options: BrowserBridgeOptions;

  constructor(options: BrowserBridgeOptions = {}) {
    this.options = {
      cdpEndpoint: 'ws://localhost:9222',
      userDataDir: undefined,
      headless: false,
      ...options,
    };
  }

  async connect(): Promise<BrowserContext> {
    try {
      this.context = await chromium.connectOverCDP(this.options.cdpEndpoint!);
      return this.context;
    } catch (error) {
      console.log('CDP connection failed, falling back to persistent context launch');
      if (!this.options.userDataDir) {
        throw new Error('CDP connection failed and no userDataDir provided for fallback');
      }
      this.context = await chromium.launchPersistentContext(this.options.userDataDir, {
        headless: this.options.headless ?? false,
      });
      return this.context;
    }
  }

  async disconnect(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  getContext(): BrowserContext | null {
    return this.context;
  }
}
