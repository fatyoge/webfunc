import { Command } from 'commander';
import { startMcpServer } from '../mcp/server.js';

export function createMcpCommand(): Command {
  return new Command('mcp')
    .description('Start MCP server for LLM tool integration')
    .option('-d, --dir <directory>', 'Skills directory', './skills')
    .option('-p, --profile <profile>', 'Browser user data directory')
    .action(async (options) => {
      await startMcpServer({
        skillsDir: options.dir,
        profile: options.profile,
      });
    });
}
