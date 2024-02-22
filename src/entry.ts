#!/usr/bin/env node
import { TelegramBotClient } from 'telebuilder';
import { StartCommand } from './commands/start.command.js';
import { DeletePostCommand } from './commands/delete-post.command.js';
import { SyncChannelInfoCommand } from './commands/sync-channel-info.command.js';

const client = new TelegramBotClient({
  commands: [
    StartCommand,
    DeletePostCommand,
    SyncChannelInfoCommand,
  ]
});

await client.init();
