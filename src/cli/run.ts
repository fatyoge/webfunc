import { Command } from 'commander';
import { SkillExecutor } from '../core/executor';
import { BrowserBridge } from '../core/browser-bridge';
import { CookieStore } from '../core/cookie-store';
import { LLMParser } from '../llm/parser';
import { Skill } from '../types/skill';
import { loadSkill } from '../core/skill-loader';
import path from 'path';

function parseParam(value: string, previous: Record<string, string> = {}) {
  const eqIndex = value.indexOf('=');
  if (eqIndex === -1) {
    throw new Error(`Invalid parameter format: "${value}". Expected "key=value".`);
  }
  const key = value.slice(0, eqIndex);
  const val = value.slice(eqIndex + 1);
  return { ...previous, [key]: val };
}

export function createRunCommand(): Command {
  return new Command('run')
    .description('Execute a recorded Skill')
    .argument('<skill-name>', 'Name of the Skill to run')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .option('-p, --profile <profile>', 'Browser user data directory')
    .option('-P, --param <param>', 'Parameter in key=value format (can be used multiple times)', parseParam, {})
    .option('-i, --interactive', 'Interactively prompt for missing parameters')
    .option('--natural <prompt>', 'Natural language prompt to extract parameters')
    .option('--api-key <key>', 'Anthropic API key for natural language parsing')
    .action(async (skillName, options) => {
      const skill = await loadSkill(skillName, options.dir);

      let params: Record<string, unknown> = {};

      // Fill defaults first
      for (const [key, param] of Object.entries(skill.parameters)) {
        if (param.default !== undefined) {
          params[key] = param.default;
        }
      }

      // Apply command-line parameters
      if (options.param && Object.keys(options.param).length > 0) {
        Object.assign(params, options.param);
      }

      if (options.natural && options.apiKey) {
        const parser = new LLMParser({ apiKey: options.apiKey });
        const parsed = await parser.parse(options.natural, skill);
        Object.assign(params, parsed);
        console.log('Parsed parameters:', parsed);
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

      const executor = new SkillExecutor();

      let result: import('../types/skill').ExecutionResult;

      if (skill.execution_mode === 'browser') {
        const page = await bridge.getPage();
        result = await executor.run(skill, {
          params,
          stepResults: {},
          cookies: '',
          page,
        });
      } else {
        const cookieStore = new CookieStore(context);
        const cookies = await cookieStore.getCookiesForUrl(skill.target_origin);
        result = await executor.run(skill, {
          params,
          stepResults: {},
          cookies,
        });
      }

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
