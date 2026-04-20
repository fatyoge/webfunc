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
