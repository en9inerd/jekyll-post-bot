import { client, inject, injectable } from 'telebuilder/decorators';
import { getImageFormat } from 'telebuilder/utils';
import { Api, type TelegramClient } from 'telegram';
import { GitService } from './git.service.js';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join as joinPaths } from 'node:path';
import { config } from 'telebuilder/config';

const channelId = config.get<string>('botConfig.channelId');

@injectable
export class ChannelSyncService {
  private readonly repoDir = config.get<string>('git.repoDir');
  private readonly configFileName = '_config.yml';
  private readonly absPathToConfig = joinPaths(this.repoDir, this.configFileName);
  private readonly postsDir = joinPaths(
    config.get<string>('git.repoDir'),
    config.get<string>('git.postsDir')
  );

  @inject(GitService)
  private gitService!: GitService;

  @client
  private client!: TelegramClient;

  public async syncChannelInfo(syncFlags: {
    logo?: boolean,
    numOfSubscribers?: boolean,
    numOfPosts?: boolean
  }) {
    let configFile: string | undefined;

    if ((syncFlags.logo || syncFlags.numOfSubscribers)) {
      const channelInfo = <Api.ChannelFull>(await this.client.invoke(
        new Api.channels.GetFullChannel({
          channel: channelId,
        })
      )).fullChat;

      if (!channelInfo.chatPhoto.id.isZero() && syncFlags.logo) {
        const logoFile = <Buffer>await this.client.downloadProfilePhoto(channelInfo.id);
        const imageExt = getImageFormat(logoFile);
        const logo = `assets/logo.${imageExt}`;
        await writeFile(joinPaths(this.repoDir, logo), logoFile);
        await this.gitService.add(logo);
      }

      if (syncFlags.numOfSubscribers) {
        configFile = await readFile(this.absPathToConfig, 'utf-8');
        configFile = configFile.replace(/num_of_subscribers: \d+/, `num_of_subscribers: ${channelInfo.participantsCount}`);
      }
    }

    if (syncFlags.numOfPosts) {
      if (!configFile) configFile = await readFile(this.absPathToConfig, 'utf-8');
      const numberOfPosts = (await readdir(this.postsDir).catch(() => [])).length;
      configFile = configFile.replace(/num_of_posts: \d+/, `num_of_posts: ${numberOfPosts}`);
    }

    if (configFile) await writeFile(this.absPathToConfig, configFile, 'utf-8');
    await this.gitService.add(this.configFileName);

  }
}
