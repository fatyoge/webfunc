import { Command } from 'commander';
import { SkillExecutor } from '../core/executor';
import { BrowserBridge } from '../core/browser-bridge';
import { CookieStore } from '../core/cookie-store';
import { LLMParser } from '../llm/parser';
import { Skill } from '../types/skill';
import fs from 'fs/promises';
import path from 'path';

export function createRunCommand(): Command {
  return new Command('run')
    .description('Execute a recorded Skill')
    .argument('<skill-name>', 'Name of the Skill to run')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .option('-p, --profile <profile>', 'Browser user data directory')
    .option('-i, --interactive', 'Interactively prompt for missing parameters')
    .option('--natural <prompt>', 'Natural language prompt to extract parameters')
    .option('--api-key <key>', 'Anthropic API key for natural language parsing')
    .action(async (skillName, options) => {
      const skillPath = path.join(options.dir, `${skillName}.json`);
      const skillData = await fs.readFile(skillPath, 'utf-8');
      const skill: Skill = JSON.parse(skillData);

      let params: Record<string, unknown> = {};

      if (options.natural && options.apiKey) {
        const parser = new LLMParser({ apiKey: options.apiKey });
        params = await parser.parse(options.natural, skill);
        console.log('Parsed parameters:', params);
      }

      if (options.interactive) {
        const inquirer = (await import('inquirer')).default;
        for (const [key, param] of Object.entries(skill.parameters)) {
          if (params[key] !== undefined) continue;
          const answer = await inquirer.prompt([
            {
              type: param.type === 'boolean' ? 'confirm' : 'input',
              name: key,
              message: param.description || `Enter ${key}:`,
              default: param.default,
            },
          ]);
          params[key] = answer[key];
        }
      }

      const bridge = new BrowserBridge({ userDataDir: options.profile });
      const context = await bridge.connect();
      const cookieStore = new CookieStore(context);
      const cookies = await cookieStore.getCookiesForUrl(skill.target_origin);

      const executor = new SkillExecutor();
      const result = await executor.run(skill, {
        params,
        stepResults: {},
        cookies,
      });

      if (result.success) {
        console.log('\n✅', result.summary);
        if (Object.keys(result.extracted).length > 0) {
          console.log('Extracted:', result.extracted);
        }
      } else {
        console.error('\n❌ Error:', result.error);
        process.exit(1);
      }

      await bridge.disconnect();
    });
}
