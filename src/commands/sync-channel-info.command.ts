import { config } from 'telebuilder/config';
import { command, handler, inject, params } from 'telebuilder/decorators';
import { Command, CommandParamsSchema, CommandScope, MessageWithParams } from 'telebuilder/types';
import { NewMessageEvent } from 'telegram/events/index.js';
import { SyncChannelInfoParams } from '../types.js';
import { GitService } from '../services/git.service.js';
import { ChannelSyncService } from '../services/channel-sync.service.js';

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

    await this.channelSyncService.syncChannelInfo({
      logo: params.logo,
      numOfPosts: params.stat,
      numOfSubscribers: params.stat,
    });

    await this.gitService.commitAndPush('Update channel info');

    await event.client.sendMessage(event.message.senderId, {
      message: 'Channel info updated successfully!',
    });
  }
}
