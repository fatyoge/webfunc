import fs from 'fs/promises';
import path from 'path';
import { Skill } from '../types/skill';

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

export async function loadSkill(name: string, dir: string): Promise<Skill> {
  const dirPath = path.join(dir, name, 'skill.json');
  try {
    const content = await fs.readFile(dirPath, 'utf-8');
    return JSON.parse(content) as Skill;
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }

  const filePath = path.join(dir, `${name}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Skill;
  } catch (err) {
    if (!isEnoent(err)) throw err;
    throw new Error(`Skill "${name}" not found in ${dir}`);
  }
}

export interface ListedSkill {
  name: string;
  skill: Skill;
  path: string;
}

export async function listSkills(dir: string): Promise<ListedSkill[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const skills: ListedSkill[] = [];
  const seen = new Set<string>();

  // First pass: directory format (priority)
  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    const stat = await fs.stat(entryPath).catch(() => null);
    if (!stat?.isDirectory()) continue;

    const skillJsonPath = path.join(entryPath, 'skill.json');
    try {
      const content = await fs.readFile(skillJsonPath, 'utf-8');
      const skill = JSON.parse(content) as Skill;
      skills.push({ name: skill.name || entry, skill, path: entryPath });
      seen.add(entry);
    } catch {
      // Not a skill directory
    }
  }

  // Second pass: file format (only for names not seen in directory format)
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const name = entry.slice(0, -5); // Remove .json
    if (seen.has(name)) continue;

    const filePath = path.join(dir, entry);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const skill = JSON.parse(content) as Skill;
      skills.push({ name: skill.name || name, skill, path: filePath });
    } catch {
      // Not a valid skill file
    }
  }

  return skills;
}
