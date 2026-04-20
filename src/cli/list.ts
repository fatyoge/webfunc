import { Command } from 'commander';
import { listSkills, loadSkill } from '../core/skill-loader';

export function createListCommand(): Command {
  const list = new Command('list')
    .description('List all recorded Skills')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .action(async (options) => {
      const skills = await listSkills(options.dir);

      if (skills.length === 0) {
        console.log('No skills found.');
        return;
      }

      console.log('\nRecorded Skills:');
      for (const { name, skill } of skills) {
        const stepCount = skill.steps?.length || 0;
        console.log(`  - ${name}: ${skill.description || 'No description'} (${stepCount} steps)`);
      }
    });

  const show = new Command('show')
    .description('Show details of a recorded Skill')
    .argument('<skill-name>', 'Name of the Skill')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .action(async (skillName, options) => {
      const skill = await loadSkill(skillName, options.dir);
      console.log(JSON.stringify(skill, null, 2));
    });

  return new Command('skills')
    .description('Skill management commands')
    .addCommand(list)
    .addCommand(show);
}
