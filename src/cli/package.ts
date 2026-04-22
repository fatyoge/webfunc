import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import type { Skill } from '../types/skill';

export function generateIndexTemplate(skill: Skill): string {
  const extractKeys = Object.keys(skill.output?.extract ?? {});
  const hasExtract = extractKeys.length > 0;

  let extractComment = '';
  if (hasExtract) {
    extractComment = `\n  // 提取字段: ${extractKeys.join(', ')}\n  // 可通过 result.extracted 访问`;
  }

  return `import fs from 'fs/promises';
import path from 'path';

export default {${extractComment}
  async postProcess(result: any, context: any) {
    const data = result.extracted;
    if (!data) return result;

    // TODO: 自定义后处理逻辑
    // 例如：生成 Markdown / Excel / 发送通知等

    return result;
  },
};
`;
}

export interface ConvertResult {
  packageDir: string;
  skillJsonPath: string;
  indexPath: string;
}

export async function convertSkillToPackage(
  name: string,
  options: { dir: string; force: boolean }
): Promise<ConvertResult> {
  const jsonPath = path.join(options.dir, `${name}.json`);
  const packageDir = path.join(options.dir, name);
  const skillJsonPath = path.join(packageDir, 'skill.json');
  const indexPath = path.join(packageDir, 'index.ts');

  // 检查旧 JSON 是否存在
  try {
    await fs.access(jsonPath);
  } catch {
    throw new Error(`Skill JSON 不存在: ${jsonPath}`);
  }

  // 检查目标目录是否已存在
  try {
    await fs.access(packageDir);
    if (!options.force) {
      throw new Error(`目录已存在: ${packageDir}（使用 --force 覆盖）`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('目录已存在')) {
      throw err;
    }
    // 目录不存在，正常继续
  }

  // 读取并解析 JSON
  const content = await fs.readFile(jsonPath, 'utf-8');
  let skill: Skill;
  try {
    skill = JSON.parse(content);
  } catch {
    throw new Error(`无效的 JSON: ${jsonPath}`);
  }

  // 创建目录
  await fs.mkdir(packageDir, { recursive: true });

  // 写入 skill.json
  await fs.writeFile(skillJsonPath, JSON.stringify(skill, null, 2) + '\n');

  // 生成 index.ts
  const indexContent = generateIndexTemplate(skill);
  await fs.writeFile(indexPath, indexContent);

  // 删除旧 JSON
  await fs.unlink(jsonPath);

  return { packageDir, skillJsonPath, indexPath };
}

export async function unpackageSkill(
  name: string,
  options: { dir: string; force: boolean }
): Promise<{ jsonPath: string; packageDir: string }> {
  const jsonPath = path.join(options.dir, `${name}.json`);
  const packageDir = path.join(options.dir, name);
  const skillJsonPath = path.join(packageDir, 'skill.json');

  // 检查 Package 目录是否存在
  try {
    await fs.access(packageDir);
  } catch {
    throw new Error(`Skill Package 不存在: ${packageDir}`);
  }

  // 检查 skill.json 是否存在
  try {
    await fs.access(skillJsonPath);
  } catch {
    throw new Error(`目录内缺少 skill.json: ${skillJsonPath}`);
  }

  // 检查目标 JSON 是否已存在
  try {
    await fs.access(jsonPath);
    if (!options.force) {
      throw new Error(`JSON 已存在: ${jsonPath}（使用 --force 覆盖）`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('JSON 已存在')) {
      throw err;
    }
    // JSON 不存在，正常继续
  }

  // 读取 skill.json
  const content = await fs.readFile(skillJsonPath, 'utf-8');
  let skill: Skill;
  try {
    skill = JSON.parse(content);
  } catch {
    throw new Error(`无效的 skill.json: ${skillJsonPath}`);
  }

  // 写回 JSON 文件
  await fs.writeFile(jsonPath, JSON.stringify(skill, null, 2) + '\n');

  // 删除 Package 目录
  await fs.rm(packageDir, { recursive: true });

  return { jsonPath, packageDir };
}

export function createPackageCommand(): Command {
  const cmd = new Command('package')
    .description('将旧格式 JSON Skill 转为 Package 格式')
    .argument('<name>', 'Skill 名称')
    .option('-d, --dir <dir>', 'Skills 目录', 'skills')
    .option('-f, --force', '覆盖已有目录', false)
    .option('--undo', '回退 Package 为单 JSON', false)
    .action(async (name: string, options: { dir: string; force: boolean; undo: boolean }) => {
      try {
        if (options.undo) {
          const result = await unpackageSkill(name, { dir: options.dir, force: options.force });
          console.log(`✅ 已回退为单 JSON: ${result.jsonPath}`);
          console.log(`   原目录已删除: ${result.packageDir}`);
        } else {
          const result = await convertSkillToPackage(name, { dir: options.dir, force: options.force });
          console.log(`✅ 已打包为 Skill Package: ${result.packageDir}/`);
          console.log(`   skill.json  — Skill 配置`);
          console.log(`   index.ts    — 自定义钩子（已生成模板）`);
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return cmd;
}
