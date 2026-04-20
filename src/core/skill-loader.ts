import fs from 'fs/promises';
import path from 'path';
import { Skill } from '../types/skill';

export async function loadSkill(name: string, dir: string): Promise<Skill> {
  // Try directory format first
  const dirPath = path.join(dir, name, 'skill.json');
  try {
    const content = await fs.readFile(dirPath, 'utf-8');
    return JSON.parse(content) as Skill;
  } catch {
    // Directory format not found, try file format
  }

  // Fallback to file format
  const filePath = path.join(dir, `${name}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Skill;
  } catch {
    throw new Error(`Skill "${name}" not found in ${dir}`);
  }
}
