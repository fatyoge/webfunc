#!/usr/bin/env node
import { Command } from 'commander';
import { createRecordCommand } from './record';
import { createRunCommand } from './run';
import { createListCommand } from './list';

const program = new Command();

program
  .name('webfunc')
  .description('Browser automation + LLM office assistant')
  .version('0.1.0');

program.addCommand(createRecordCommand());
program.addCommand(createRunCommand());
program.addCommand(createListCommand());

program.parse();
