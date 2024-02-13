#!/usr/bin/env node
import { TelegramBotClient } from 'telebuilder';
import { StartCommand } from './commands/start.command.js';

const client = new TelegramBotClient({
  commands: [
    StartCommand
  ]
});

await client.init();
