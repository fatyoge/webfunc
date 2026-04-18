import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';

export function createListCommand(): Command {
  const list = new Command('list')
    .description('List all recorded Skills')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .action(async (options) => {
      try {
        const files = await fs.readdir(options.dir);
        const skills = files.filter((f) => f.endsWith('.json'));

        if (skills.length === 0) {
          console.log('No skills found.');
          return;
        }

        console.log('\nRecorded Skills:');
        for (const file of skills) {
          const data = await fs.readFile(path.join(options.dir, file), 'utf-8');
          const skill = JSON.parse(data);
          console.log(`  - ${skill.name}: ${skill.description || 'No description'} (${skill.steps.length} steps)`);
        }
      } catch {
        console.log('No skills found.');
      }
    });

  const show = new Command('show')
    .description('Show details of a recorded Skill')
    .argument('<skill-name>', 'Name of the Skill')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .action(async (skillName, options) => {
      const skillPath = path.join(options.dir, `${skillName}.json`);
      const data = await fs.readFile(skillPath, 'utf-8');
      const skill = JSON.parse(data);
      console.log(JSON.stringify(skill, null, 2));
    });

  return new Command('skills')
    .description('Skill management commands')
    .addCommand(list)
    .addCommand(show);
}
