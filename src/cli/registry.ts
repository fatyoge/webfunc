import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Command } from 'commander';

export interface RegistryEntry {
  name: string;
  source: string;
  addedAt: string;
}

function getGlobalDir(override?: string): string {
  return override || path.join(os.homedir(), '.webfunc');
}

function getRegistryPath(globalDir: string): string {
  return path.join(globalDir, 'registry.json');
}

async function readRegistries(globalDir: string): Promise<RegistryEntry[]> {
  try {
    const data = await fs.readFile(getRegistryPath(globalDir), 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeRegistries(globalDir: string, registries: RegistryEntry[]): Promise<void> {
  await fs.mkdir(globalDir, { recursive: true });
  await fs.writeFile(getRegistryPath(globalDir), JSON.stringify(registries, null, 2));
}

export async function addRegistry(name: string, source: string, globalDir?: string): Promise<void> {
  const dir = getGlobalDir(globalDir);
  const registries = await readRegistries(dir);
  const existing = registries.findIndex((r) => r.name === name);
  const entry: RegistryEntry = { name, source, addedAt: new Date().toISOString() };
  if (existing >= 0) {
    registries[existing] = entry;
    console.log(`Registry "${name}" updated.`);
  } else {
    registries.push(entry);
    console.log(`Registry "${name}" added.`);
  }
  await writeRegistries(dir, registries);
}

export async function listRegistries(globalDir?: string): Promise<RegistryEntry[]> {
  const dir = getGlobalDir(globalDir);
  return readRegistries(dir);
}

export async function removeRegistry(name: string, globalDir?: string): Promise<void> {
  const dir = getGlobalDir(globalDir);
  const registries = await readRegistries(dir);
  const filtered = registries.filter((r) => r.name !== name);
  if (filtered.length === registries.length) {
    console.log(`Registry "${name}" not found.`);
    return;
  }
  await writeRegistries(dir, filtered);
  console.log(`Registry "${name}" removed.`);
}

export function createRegistryCommand(): Command {
  const registry = new Command('registry')
    .description('Manage skill registries');

  registry
    .command('add')
    .description('Add a skill registry')
    .argument('<name>', 'Registry name')
    .argument('<source>', 'Registry source (git URL or file path)')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (name, source, options) => {
      await addRegistry(name, source, options.globalDir);
    });

  registry
    .command('list')
    .description('List all registries')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (options) => {
      const registries = await listRegistries(options.globalDir);
      if (registries.length === 0) {
        console.log('No registries configured.');
        return;
      }
      console.log('\nRegistries:');
      for (const r of registries) {
        console.log(`  ${r.name}: ${r.source}`);
      }
    });

  registry
    .command('remove')
    .description('Remove a registry')
    .argument('<name>', 'Registry name')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (name, options) => {
      await removeRegistry(name, options.globalDir);
    });

  return registry;
}
