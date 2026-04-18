import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserBridge } from '../../src/core/browser-bridge';

// Mock Playwright
vi.mock('playwright', () => ({
  chromium: {
    connectOverCDP: vi.fn(),
    launchPersistentContext: vi.fn(),
  },
}));

import { chromium } from 'playwright';

describe('BrowserBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connects via CDP when browser is running', async () => {
    const mockContext = {
      pages: () => [{ url: () => 'https://example.com' }],
      close: vi.fn(),
    };
    (chromium.connectOverCDP as any).mockResolvedValue(mockContext);

    const bridge = new BrowserBridge();
    const context = await bridge.connect();

    expect(chromium.connectOverCDP).toHaveBeenCalledWith('ws://localhost:9222');
    expect(context).toBe(mockContext);
  });

  it('falls back to userDataDir launch when CDP fails', async () => {
    (chromium.connectOverCDP as any).mockRejectedValue(new Error('Connection refused'));
    const mockContext = {
      pages: () => [],
      close: vi.fn(),
    };
    (chromium.launchPersistentContext as any).mockResolvedValue(mockContext);

    const bridge = new BrowserBridge({ userDataDir: '/tmp/test-profile' });
    const context = await bridge.connect();

    expect(chromium.launchPersistentContext).toHaveBeenCalledWith('/tmp/test-profile', {
      headless: false,
    });
    expect(context).toBe(mockContext);
  });

  it('closes context on disconnect', async () => {
    const mockContext = {
      pages: () => [],
      close: vi.fn(),
    };
    (chromium.connectOverCDP as any).mockResolvedValue(mockContext);

    const bridge = new BrowserBridge();
    await bridge.connect();
    await bridge.disconnect();

    expect(mockContext.close).toHaveBeenCalled();
  });
});
