import { config } from 'telebuilder/config';
import { command, handler, inject, params } from 'telebuilder/decorators';
import { Command, CommandParamsSchema, CommandScope, MessageWithParams } from 'telebuilder/types';
import { Api } from 'telegram';
import { NewMessageEvent } from 'telegram/events/index.js';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join as joinPaths } from 'path';
import { getImageFormat } from 'telebuilder/utils';
import { GitService } from '../services/git.service.js';
import { SyncChannelInfoParams } from '../types.js';

const channelAuthor = config.get<string>('botConfig.channelAuthor');
const channelId = config.get<string>('botConfig.channelId');

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

  private readonly repoDir = config.get<string>('git.repoDir');
  private readonly postsDir = joinPaths(
    config.get<string>('git.repoDir'),
    config.get<string>('git.postsDir')
  );

  @inject(GitService)
  private gitService!: GitService;

  constructor() { }

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

    const channelInfo = <Api.ChannelFull>(await event.client.invoke(
      new Api.channels.GetFullChannel({
        channel: channelId,
      })
    )).fullChat;

    if (!channelInfo.chatPhoto.id.isZero() && params.logo) {
      const logoFile = <Buffer>await event.client.downloadProfilePhoto(channelInfo.id);
      const imageExt = getImageFormat(logoFile);
      const logo = `assets/logo.${imageExt}`;
      await writeFile(joinPaths(this.repoDir, logo), logoFile);
      await this.gitService.add(logo);
    }

    if (params.stat) {
      let configFile = await readFile(joinPaths(this.repoDir, '_config.yml'), 'utf-8');
      const numberOfPosts = (await readdir(this.postsDir)).length;

      configFile = configFile.replace(/num_of_posts: \d+/, `num_of_posts: ${numberOfPosts}`)
        .replace(/num_of_subscribers: \d+/, `num_of_subscribers: ${channelInfo.participantsCount}`);

      await writeFile(joinPaths(this.repoDir, '_config.yml'), configFile, 'utf-8');
      await this.gitService.add('_config.yml');
    }

    await this.gitService.commit('Update channel info');
    await this.gitService.push();

    await event.client.sendMessage(event.message.senderId, {
      message: 'Channel info updated successfully!',
    });
  }
}
