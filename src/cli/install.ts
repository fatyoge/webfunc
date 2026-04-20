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
