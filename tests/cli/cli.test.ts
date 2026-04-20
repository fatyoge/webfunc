import { describe, it, expect } from 'vitest';

describe('CLI', () => {
  it('record command module loads', async () => {
    const mod = await import('../../src/cli/record');
    expect(mod).toBeDefined();
    expect(mod.createRecordCommand).toBeDefined();
  });

  it('run command module loads', async () => {
    const mod = await import('../../src/cli/run');
    expect(mod).toBeDefined();
    expect(mod.createRunCommand).toBeDefined();
  });

  it('list command module loads', async () => {
    const mod = await import('../../src/cli/list');
    expect(mod).toBeDefined();
    expect(mod.createListCommand).toBeDefined();
  });

  it('install command module loads', async () => {
    const mod = await import('../../src/cli/install');
    expect(mod).toBeDefined();
    expect(mod.createInstallCommand).toBeDefined();
  });
});
