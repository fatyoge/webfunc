import path from 'path';
import fs from 'fs/promises';

export interface ParsedSource {
  type: 'git' | 'local';
  repo?: string;
  branch?: string;
  path?: string;
  localPath?: string;
}

export function parseSource(source: string): ParsedSource {
  if (
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('\\\\') ||
    /^[a-zA-Z]:/.test(source)
  ) {
    return { type: 'local', localPath: path.resolve(source) };
  }

  let repoUrl = source;
  let ref = '';

  const hashIndex = repoUrl.indexOf('#');
  if (hashIndex !== -1) {
    ref = repoUrl.slice(hashIndex + 1);
    repoUrl = repoUrl.slice(0, hashIndex);
  }

  if (!repoUrl.includes('://') && !repoUrl.includes('@')) {
    repoUrl = `https://github.com/${repoUrl}.git`;
  }

  if (!repoUrl.endsWith('.git')) {
    repoUrl += '.git';
  }

  let branch = 'main';
  let subPath = '';

  if (ref) {
    const colonIndex = ref.indexOf(':');
    if (colonIndex !== -1) {
      branch = ref.slice(0, colonIndex);
      subPath = ref.slice(colonIndex + 1);
    } else if (ref.includes('/')) {
      subPath = ref;
    } else {
      branch = ref;
    }
  }

  return { type: 'git', repo: repoUrl, branch, path: subPath };
}

export interface InstallOptions {
  force?: boolean;
}

export async function installSkill(
  sourcePath: string,
  targetDir: string,
  options: InstallOptions = {}
): Promise<void> {
  const skillJsonPath = path.join(sourcePath, 'skill.json');
  const content = await fs.readFile(skillJsonPath, 'utf-8');
  const skill = JSON.parse(content);
  const skillName = skill.name || path.basename(sourcePath);

  const targetPath = path.join(targetDir, skillName);

  const exists = await fs.stat(targetPath).catch(() => null);
  if (exists && !options.force) {
    console.log(`Skill "${skillName}" already exists, skipping (use --force to overwrite)`);
    return;
  }

  await fs.mkdir(targetPath, { recursive: true });

  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(sourcePath, entry.name);
    const dest = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(dest, { recursive: true });
      const subEntries = await fs.readdir(src, { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isFile()) {
          await fs.copyFile(path.join(src, sub.name), path.join(dest, sub.name));
        }
      }
    } else {
      await fs.copyFile(src, dest);
    }
  }

  console.log(`Installed skill "${skillName}" to ${targetPath}`);
}

import { spawn } from 'child_process';
import os from 'os';
import { Command } from 'commander';

async function execGit(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git failed: ${stderr || stdout}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function cloneGitRepo(repo: string, branch: string, tmpDir: string): Promise<void> {
  await execGit(['clone', '--branch', branch, '--single-branch', '--depth', '1', repo, tmpDir]);
}

export function createInstallCommand(): Command {
  return new Command('install')
    .description('Install skills from git or local path')
    .argument('<source>', 'Git URL or local path')
    .option('-d, --dir <directory>', 'Target skills directory', './skills')
    .option('--all', 'Install all skills from registry')
    .option('-f, --force', 'Overwrite existing skills')
    .action(async (source, options) => {
      const targetDir = path.resolve(options.dir);
      await fs.mkdir(targetDir, { recursive: true });

      const parsed = parseSource(source);

      if (parsed.type === 'local') {
        const localPath = parsed.localPath!;
        const stat = await fs.stat(localPath).catch(() => null);
        if (!stat) {
          console.error(`Path not found: ${localPath}`);
          process.exit(1);
        }

        if (options.all) {
          await installAllFromDir(localPath, targetDir, options);
        } else {
          await installSkill(localPath, targetDir, options);
        }
        return;
      }

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webfunc-git-'));
      try {
        console.log(`Cloning ${parsed.repo}#${parsed.branch}...`);
        await cloneGitRepo(parsed.repo!, parsed.branch!, tmpDir);

        if (options.all) {
          const sourceDir = parsed.path ? path.join(tmpDir, parsed.path) : tmpDir;
          await installAllFromDir(sourceDir, targetDir, options);
        } else {
          const sourceDir = parsed.path ? path.join(tmpDir, parsed.path) : tmpDir;
          const stat = await fs.stat(sourceDir).catch(() => null);
          if (!stat) {
            console.error(`Path not found in cloned repo: ${parsed.path}`);
            process.exit(1);
          }
          await installSkill(sourceDir, targetDir, options);
        }
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
}

async function installAllFromDir(
  sourceDir: string,
  targetDir: string,
  options: InstallOptions
): Promise<void> {
  const registryPath = path.join(sourceDir, 'registry.json');
  try {
    const registryContent = await fs.readFile(registryPath, 'utf-8');
    const registry = JSON.parse(registryContent);
    if (registry.skills && Array.isArray(registry.skills)) {
      console.log(`Found registry with ${registry.skills.length} skills`);
      const failures: string[] = [];
      for (const entry of registry.skills) {
        const skillDir = path.join(sourceDir, entry.directory || entry.name);
        try {
          await installSkill(skillDir, targetDir, options);
        } catch (err: any) {
          failures.push(`${entry.name}: ${err.message}`);
        }
      }
      if (failures.length > 0) {
        console.error('\nFailed to install some skills:');
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
      }
      return;
    }
  } catch {
    // registry.json not found or invalid, fall through to scan
  }

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const skillDirs = entries.filter((e) => e.isDirectory());

  if (skillDirs.length === 0) {
    console.log('No skills found in source directory');
    return;
  }

  for (const entry of skillDirs) {
    const skillPath = path.join(sourceDir, entry.name);
    const hasSkillJson = await fs.stat(path.join(skillPath, 'skill.json')).catch(() => null);
    if (hasSkillJson) {
      try {
        await installSkill(skillPath, targetDir, options);
      } catch (err: any) {
        console.error(`Failed to install ${entry.name}: ${err.message}`);
      }
    }
  }
}
