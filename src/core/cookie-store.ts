import { BrowserContext } from 'playwright';

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
}

export class CookieStore {
  private context: BrowserContext;

  constructor(context: BrowserContext) {
    this.context = context;
  }

  async getCookiesForUrl(url: string): Promise<string> {
    const cookies = await this.context.cookies(url);
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }
}
