import { Command } from 'commander';
import { SkillLoader } from '../core/skill-loader';

export function createListCommand(): Command {
  const list = new Command('list')
    .description('List all recorded Skills')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .action(async (options) => {
      const loader = new SkillLoader({ localDir: options.dir });
      const skills = await loader.list();

      if (skills.length === 0) {
        console.log('No skills found.');
        return;
      }

      console.log('\nAvailable Skills:');
      for (const loaded of skills) {
        const marker = loaded.module ? '📦' : '📄';
        const steps = loaded.skill.steps?.length || 0;
        console.log(`  ${marker} ${loaded.name}: ${loaded.skill.description || 'No description'} (${steps} steps)`);
      }
    });

  const show = new Command('show')
    .description('Show details of a recorded Skill')
    .argument('<skill-name>', 'Name of the Skill')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .action(async (skillName, options) => {
      const loader = new SkillLoader({ localDir: options.dir });
      const loaded = await loader.load(skillName);
      console.log(JSON.stringify(loaded.skill, null, 2));
      if (loaded.module) {
        console.log('\n[Has custom module]');
      }
    });

  return new Command('skills')
    .description('Skill management commands')
    .addCommand(list)
    .addCommand(show);
}
