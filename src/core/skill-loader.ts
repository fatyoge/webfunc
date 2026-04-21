import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { pathToFileURL } from 'url';
import type { Skill } from '../types/skill';
import type { SkillModule } from '../types/skill-module';

export interface LoadedSkill {
  name: string;
  skill: Skill;
  module?: SkillModule;
  path: string;
}

export interface SkillLoaderOptions {
  globalDir?: string;
  localDir?: string;
}

function getGlobalDir(): string {
  return path.join(os.homedir(), '.webfunc');
}

function getLinksDir(globalDir: string): string {
  return path.join(globalDir, 'installed', '.links');
}

function getInstalledDir(globalDir: string): string {
  return path.join(globalDir, 'installed');
}

export class SkillLoader {
  private globalDir: string;
  private localDir?: string;

  constructor(options: SkillLoaderOptions = {}) {
    this.globalDir = options.globalDir || getGlobalDir();
    this.localDir = options.localDir;
  }

  /** 加载指定 skill（按优先级查找） */
  async load(name: string): Promise<LoadedSkill> {
    // 1. 全局已安装的 skill
    const globalLink = path.join(getLinksDir(this.globalDir), name);
    try {
      const stat = await fs.stat(globalLink);
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        const realPath = stat.isSymbolicLink() ? await fs.readlink(globalLink) : globalLink;
        const resolved = path.isAbsolute(realPath) ? realPath : path.join(path.dirname(globalLink), realPath);
        return await this.loadFromPath(resolved);
      }
    } catch {
      // not found globally
    }

    // 2. 本地目录 skill
    if (this.localDir) {
      const localDirPath = path.join(this.localDir, name);
      try {
        const stat = await fs.stat(localDirPath);
        if (stat.isDirectory()) {
          return await this.loadFromPath(localDirPath);
        }
      } catch {
        // not found as directory
      }

      // 3. 本地 JSON skill
      const localJsonPath = path.join(this.localDir, `${name}.json`);
      try {
        await fs.access(localJsonPath);
        return await this.loadFromPath(localJsonPath);
      } catch {
        // not found as json
      }
    }

    throw new Error(`Skill "${name}" not found. Install it with: webfunc install ${name}`);
  }

  /** 列出所有可用的 skill */
  async list(): Promise<LoadedSkill[]> {
    const results: LoadedSkill[] = [];
    const seen = new Set<string>();

    // 1. 全局已安装
    const linksDir = getLinksDir(this.globalDir);
    try {
      const links = await fs.readdir(linksDir);
      for (const name of links) {
        if (seen.has(name)) continue;
        try {
          const loaded = await this.load(name);
          results.push(loaded);
          seen.add(name);
        } catch {
          // skip broken links
        }
      }
    } catch {
      // no global skills
    }

    // 2. 本地目录 skills
    if (this.localDir) {
      try {
        const entries = await fs.readdir(this.localDir, { withFileTypes: true });
        for (const entry of entries) {
          if (seen.has(entry.name)) continue;
          if (entry.isDirectory()) {
            const skillPath = path.join(this.localDir, entry.name);
            try {
              const loaded = await this.loadFromPath(skillPath);
              results.push(loaded);
              seen.add(entry.name);
            } catch {
              // not a valid skill directory
            }
          } else if (entry.name.endsWith('.json')) {
            const name = entry.name.replace(/\.json$/, '');
            if (seen.has(name)) continue;
            const skillPath = path.join(this.localDir, entry.name);
            try {
              const loaded = await this.loadFromPath(skillPath);
              results.push(loaded);
              seen.add(name);
            } catch {
              // not valid json
            }
          }
        }
      } catch {
        // no local skills
      }
    }

    return results;
  }

  /** 从指定路径加载 skill（目录或 JSON 文件） */
  async loadFromPath(skillPath: string): Promise<LoadedSkill> {
    const stat = await fs.stat(skillPath);

    if (stat.isFile() && skillPath.endsWith('.json')) {
      // 纯 JSON skill
      const content = await fs.readFile(skillPath, 'utf-8');
      const skill: Skill = JSON.parse(content);
      return {
        name: skill.name,
        skill,
        path: path.dirname(skillPath),
      };
    }

    if (stat.isDirectory()) {
      // 目录型 skill
      const jsonPath = path.join(skillPath, 'skill.json');
      await fs.access(jsonPath);
      const content = await fs.readFile(jsonPath, 'utf-8');
      const skill: Skill = JSON.parse(content);

      // 尝试加载 JS/TS 模块
      const module = await this.loadModule(skillPath);

      // 合并 meta
      const mergedSkill = module?.meta ? { ...module.meta, ...skill } : skill;

      return {
        name: skill.name,
        skill: mergedSkill,
        module,
        path: skillPath,
      };
    }

    throw new Error(`Invalid skill path: ${skillPath}`);
  }

  /** 尝试加载目录中的 JS/TS 模块 */
  private async loadModule(dirPath: string): Promise<SkillModule | undefined> {
    // 优先已编译的 JS，否则尝试 TS
    const candidates = [
      path.join(dirPath, 'index.js'),
      path.join(dirPath, 'index.ts'),
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        if (candidate.endsWith('.ts')) {
          // 在 CJS 环境中使用 require 加载 TS 文件（需 tsx 支持）
          // require 的相对路径基于当前文件，所以转为绝对路径
          const req = eval('require') as NodeRequire;
          const absCandidate = path.resolve(candidate);
          const mod = req(absCandidate);
          return (mod.default || mod) as SkillModule;
        }
        const mod = await import(pathToFileURL(candidate).href);
        return (mod.default || mod) as SkillModule;
      } catch {
        // continue to next candidate
      }
    }

    return undefined;
  }
}
