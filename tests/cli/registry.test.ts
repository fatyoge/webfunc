import { describe, it, expect } from 'vitest';
import { addRegistry, listRegistries, removeRegistry } from '../../src/cli/registry';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('registry management', () => {
  const testGlobalDir = path.join(os.tmpdir(), 'webfunc-registry-test-' + Date.now());

  it('should add and list a registry', async () => {
    await addRegistry('my-skills', 'https://example.com/registry.json', testGlobalDir);
    const registries = await listRegistries(testGlobalDir);
    expect(registries).toHaveLength(1);
    expect(registries[0].name).toBe('my-skills');
    expect(registries[0].source).toBe('https://example.com/registry.json');
  });

  it('should remove a registry', async () => {
    await addRegistry('to-remove', 'https://example.com/r.json', testGlobalDir);
    await removeRegistry('to-remove', testGlobalDir);
    const registries = await listRegistries(testGlobalDir);
    expect(registries.find((r) => r.name === 'to-remove')).toBeUndefined();
  });
});
