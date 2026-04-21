import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { Command } from 'commander';
import axios from 'axios';
import { listRegistries } from './registry';

function getGlobalDir(override?: string): string {
  return override || path.join(os.homedir(), '.webfunc');
}

function getInstalledDir(globalDir: string): string {
  return path.join(globalDir, 'installed');
}

function getLinksDir(globalDir: string): string {
  return path.join(globalDir, 'installed', '.links');
}

function getRegistryInstalledPath(globalDir: string, name: string, version: string): string {
  return path.join(getInstalledDir(globalDir), `${name}@${version}`);
}

function parseGitUrl(source: string): { url: string; branch?: string } {
  const hashIdx = source.lastIndexOf('#');
  if (hashIdx > 0) {
    return { url: source.slice(0, hashIdx), branch: source.slice(hashIdx + 1) };
  }
  return { url: source };
}

export async function installSkill(source: string, globalDir?: string): Promise<void> {
  const dir = getGlobalDir(globalDir);
  const installedDir = getInstalledDir(dir);
  const linksDir = getLinksDir(dir);

  await fs.mkdir(installedDir, { recursive: true });
  await fs.mkdir(linksDir, { recursive: true });

  let sourcePath: string;
  let isLocal = false;

  // 判断是本地路径还是 git URL
  if (source.startsWith('git@') || source.startsWith('https://') || source.startsWith('http://')) {
    // git 安装
    const { url, branch } = parseGitUrl(source);
    const tempDir = path.join(os.tmpdir(), `webfunc-install-${Date.now()}`);

    const branchArg = branch ? `-b ${branch}` : '';
    execSync(`git clone --depth 1 ${branchArg} ${url} ${tempDir}`, { stdio: 'inherit' });
    sourcePath = tempDir;
  } else {
    // 本地路径
    sourcePath = path.resolve(source);
    isLocal = true;
  }

  // 读取 skill.json 获取 name 和 version
  const skillJsonPath = path.join(sourcePath, 'skill.json');
  const content = await fs.readFile(skillJsonPath, 'utf-8');
  const skill = JSON.parse(content);
  const name = skill.name;
  const version = skill.version || '0.0.0';

  if (!name) {
    throw new Error('skill.json must have a "name" field');
  }

  const targetPath = getRegistryInstalledPath(dir, name, version);

  // 复制/移动到安装目录
  if (isLocal) {
    await copyDir(sourcePath, targetPath);
  } else {
    await fs.rename(sourcePath, targetPath);
  }

  // 创建/更新激活链接
  const linkPath = path.join(linksDir, name);
  try {
    await fs.unlink(linkPath);
  } catch {
    // link does not exist
  }
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  await fs.symlink(targetPath, linkPath, symlinkType);

  console.log(`Skill "${name}@${version}" installed.`);
}

export async function installFromRegistry(skillName: string, globalDir?: string): Promise<void> {
  const dir = getGlobalDir(globalDir);
  const registries = await listRegistries(dir);

  for (const registry of registries) {
    try {
      const registryData = await loadRegistry(registry.source);
      const entry = registryData.skills?.find((s: any) => s.name === skillName);
      if (entry) {
        await installSkill(entry.source, globalDir);
        return;
      }
    } catch {
      // skip broken registry
    }
  }

  throw new Error(`Skill "${skillName}" not found in any registry.`);
}

async function loadRegistry(source: string): Promise<any> {
  if (source.startsWith('http')) {
    const res = await axios.get(source);
    return res.data;
  }
  const content = await fs.readFile(source, 'utf-8');
  return JSON.parse(content);
}

export async function removeSkill(name: string, globalDir?: string): Promise<void> {
  const dir = getGlobalDir(globalDir);
  const linkPath = path.join(getLinksDir(dir), name);

  try {
    await fs.unlink(linkPath);
    console.log(`Skill "${name}" removed.`);
  } catch {
    console.log(`Skill "${name}" is not installed.`);
  }
}

export async function listInstalledSkills(globalDir?: string): Promise<string[]> {
  const dir = getGlobalDir(globalDir);
  const linksDir = getLinksDir(dir);
  try {
    return await fs.readdir(linksDir);
  } catch {
    return [];
  }
}

export async function updateSkill(name: string, globalDir?: string): Promise<void> {
  // 简单实现：remove 然后重新 install
  // 更完整的实现应该读取 registry 中的最新版本
  await removeSkill(name, globalDir);
  await installFromRegistry(name, globalDir);
  console.log(`Skill "${name}" updated.`);
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export function createInstallCommand(): Command {
  return new Command('install')
    .description('Install a skill')
    .argument('[source]', 'Skill name from registry, git URL, or local path')
    .option('-a, --all', 'Install all skills from registries')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (source, options) => {
      if (options.all) {
        const dir = getGlobalDir(options.globalDir);
        const registries = await listRegistries(dir);
        for (const registry of registries) {
          try {
            const registryData = await loadRegistry(registry.source);
            for (const skill of registryData.skills || []) {
              try {
                await installSkill(skill.source, options.globalDir);
              } catch (err: any) {
                console.warn(`Failed to install ${skill.name}: ${err.message}`);
              }
            }
          } catch (err: any) {
            console.warn(`Failed to load registry ${registry.name}: ${err.message}`);
          }
        }
        return;
      }

      if (!source) {
        console.error('Please provide a skill name, git URL, or local path. Use --all to install all from registries.');
        process.exit(1);
      }

      // 判断是 registry name、git URL 还是本地路径
      if (source.includes('@') || source.startsWith('git@') || source.startsWith('http')) {
        // git URL
        await installSkill(source, options.globalDir);
      } else if (path.isAbsolute(source) || source.startsWith('.') || source.startsWith('~')) {
        // 本地路径
        await installSkill(source, options.globalDir);
      } else {
        // 尝试从 registry 安装
        try {
          await installFromRegistry(source, options.globalDir);
        } catch {
          // 如果 registry 找不到，当作本地路径尝试
          await installSkill(source, options.globalDir);
        }
      }
    });
}

export function createRemoveCommand(): Command {
  return new Command('remove')
    .description('Remove an installed skill')
    .argument('<name>', 'Skill name')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (name, options) => {
      await removeSkill(name, options.globalDir);
    });
}

export function createUpdateCommand(): Command {
  return new Command('update')
    .description('Update an installed skill')
    .argument('[name]', 'Skill name (omit for --all)')
    .option('-a, --all', 'Update all installed skills')
    .option('-g, --global-dir <dir>', 'Override global config directory')
    .action(async (name, options) => {
      if (options.all) {
        const installed = await listInstalledSkills(options.globalDir);
        for (const n of installed) {
          try {
            await updateSkill(n, options.globalDir);
          } catch (err: any) {
            console.warn(`Failed to update ${n}: ${err.message}`);
          }
        }
        return;
      }
      if (!name) {
        console.error('Please provide a skill name or use --all.');
        process.exit(1);
      }
      await updateSkill(name, options.globalDir);
    });
}
