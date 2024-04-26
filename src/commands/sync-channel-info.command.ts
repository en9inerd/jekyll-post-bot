import { config } from 'telebuilder/config';
import { command, handler, inject, params } from 'telebuilder/decorators';
import type { Command, CommandParamsSchema, CommandScope, MessageWithParams } from 'telebuilder/types';
import type { NewMessageEvent } from 'telegram/events/index.js';
import type { SyncChannelInfoParams } from '../types.js';
import { GitService } from '../services/git.service.js';
import { ChannelSyncService } from '../services/channel-sync.service.js';
import { formatErrorMessage } from 'telebuilder/utils';

const channelAuthor = config.get<string>('botConfig.channelAuthor');

@command
export class SyncChannelInfoCommand implements Command {
  command = 'sync_channel_info';
  description = 'Sync channel info';
  scopes: CommandScope[] = [
    {
      name: 'Peer',
      peer: channelAuthor,
    },
  ];
  langCodes = [];
  @params params: CommandParamsSchema = {
    logo: {
      type: 'boolean',
      required: true,
    },
    stat: {
      type: 'boolean',
      required: true,
    }
  };

  @inject(GitService)
  private gitService!: GitService;

  @inject(ChannelSyncService)
  private channelSyncService!: ChannelSyncService;

  @handler({
    event: {
      fromUsers: [channelAuthor],
    }
  })
  async entryHandler(event: NewMessageEvent) {
    if (!event.client || !event?.message?.senderId) return;

    const params = (<MessageWithParams<SyncChannelInfoParams>>event.message).params;

    if (!params) {
      await event.client.sendMessage(event.message.senderId, {
        message: 'This command requires parameters!',
      });
      return;
    }

    try {
      await this.channelSyncService.syncChannelInfo({
        logo: params.logo,
        numOfPosts: params.stat,
        numOfSubscribers: params.stat,
      });

      await this.gitService.commitAndPush('Update channel info');
    } catch (e) {
      await event.client.sendMessage(event.message.senderId, {
        message: `Error syncing channel info: ${formatErrorMessage(<Error>e)}`,
      });

      return;
    }

    await event.client.sendMessage(event.message.senderId, {
      message: 'Channel info updated successfully!',
    });
  }
}
