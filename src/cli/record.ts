import { Command } from 'commander';
import { BrowserBridge } from '../core/browser-bridge';
import { SkillRecorder } from '../core/recorder';
import path from 'path';

export function createRecordCommand(): Command {
  return new Command('record')
    .description('Record a new Skill from browser interactions')
    .argument('<skill-name>', 'Name of the Skill to record')
    .option('-o, --origin <origin>', 'Target origin to record requests from')
    .option('-d, --dir <directory>', 'Output directory for skills', './skills')
    .option('-p, --profile <profile>', 'Browser user data directory')
    .action(async (skillName, options) => {
      if (!options.origin) {
        console.error('Error: --origin is required (e.g., https://api.example.com)');
        process.exit(1);
      }

      const bridge = new BrowserBridge({ userDataDir: options.profile });
      const recorder = new SkillRecorder(path.resolve(options.dir));

      console.log(`Connecting to browser...`);
      const context = await bridge.connect();
      console.log('Connected. Perform your actions in the browser. Press Enter when done.');

      await recorder.start(context, options.origin);

      process.stdin.once('data', async () => {
        const skill = await recorder.stop(skillName);
        console.log(`\nSkill saved to ${options.dir}/${skillName}.json`);
        console.log(`Recorded ${skill.steps.length} steps`);
        await bridge.disconnect();
        process.exit(0);
      });
    });
}
