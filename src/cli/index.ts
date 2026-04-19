#!/usr/bin/env node
import { Command } from 'commander';
import { createRecordCommand } from './record';
import { createRunCommand } from './run';
import { createListCommand } from './list';
import { createMcpCommand } from './mcp';

const program = new Command();

program
  .name('webfunc')
  .description('Browser automation + LLM office assistant')
  .version('0.1.0');

program.addCommand(createRecordCommand());
program.addCommand(createRunCommand());
program.addCommand(createListCommand());
program.addCommand(createMcpCommand());

program.parse();
