import { client, inject, injectable } from 'telebuilder/decorators';
import type { ChannelPost, ExportedMessage, TextEntity } from '../types.js';
import { config } from 'telebuilder/config';
import { join as joinPaths } from 'node:path';
import { readFile, mkdir, readdir, access } from 'node:fs/promises';
import PostHelper from '../helpers/post.helper.js';
import { GitService } from './git.service.js';
import { PostService } from './post.service.js';
import type { Api, TelegramClient } from 'telegram';

@injectable
export class ChannelExportService {
  private readonly channelId = config.get<string>('botConfig.channelId');
  private readonly offlineMedia = config.get<boolean>('botConfig.offlineMedia', false);
  private readonly repoDir = config.get<string>("git.repoDir");
  private readonly jsonFile = joinPaths(
    config.get<string>('botConfig.exportedDataDir'),
    'result.json'
  );
  private readonly postsDir = joinPaths(
    this.repoDir,
    config.get<string>('git.postsDir')
  );
  private readonly postImagesDir = joinPaths(
    this.repoDir,
    config.get<string>('git.postImagesDir')
  );
  private posts: ChannelPost[] = [];

  @client
  private client!: TelegramClient;

  @inject(GitService)
  private gitService!: GitService;

  @inject(PostService)
  private postService!: PostService;

  public async extractPosts(): Promise<void> {
    const data: {
      messages: ExportedMessage[];
    } = JSON.parse(await readFile(this.jsonFile, 'utf-8'));

    // If offlineMedia is true, take media from the exported data directory.
    // Otherwise, download media from the channel.
    if (this.offlineMedia) {
      for (const [i, msg] of data.messages.entries()) {
        if (this.skipMessage(msg)) continue;

        if (msg.date_unixtime !== data.messages[i - 1]?.date_unixtime) {
          const post = this.createNewPost(msg);
          this.posts.push(post);
        } else {
          const media = msg?.photo || msg?.thumbnail;
          const content = this.buildContent(msg.text_entities);

          if (media) this.posts[this.posts.length - 1].mediaSource.push(media);
          if (content) this.posts[this.posts.length - 1].content = content;
          this.posts[this.posts.length - 1].title = PostHelper.setTitle(content);
        }
      }
    } else {
      const messageIds = data.messages.filter((msg) => !this.skipMessage(msg)).map((msg) => msg.id);
      const groupedMessages: Api.Message[][] = [];
      for await (const msg of this.client.iterMessages(this.channelId, { ids: messageIds })) {
        if (msg.groupedId) {
          const index = groupedMessages.findIndex(
            (group) => group[0].groupedId?.eq(<bigInt.BigInteger>msg.groupedId)
          );
          if (index === -1) {
            groupedMessages.push([msg]);
          } else {
            groupedMessages[index].push(msg);
          }
        } else {
          groupedMessages.push([msg]);
        }
      }

      for (const messages of groupedMessages) {
        await this.postService.processMessage(this.client, messages, false, false);
      }
    }
  }

  private skipMessage(msg: ExportedMessage): boolean {
    // Skip messages that are not videos, animations, photos, or text.
    // Also skip service messages, messages with no date, and forwarded messages.
    return (msg?.media_type && !['video_file', 'animation'].includes(msg.media_type)) ||
      msg?.type === 'service' ||
      !!msg?.forwarded_from ||
      msg?.date_unixtime === '0';
  }

  private createNewPost(msg: ExportedMessage): ChannelPost {
    const media = msg?.photo || msg?.thumbnail;
    const content = this.buildContent(msg.text_entities);
    return {
      id: msg.id,
      date: msg.date_unixtime,
      content,
      title: PostHelper.setTitle(content),
      mediaSource: (media ? [media] : []),
      mediaDestination: [],
      relMediaDestination: []
    };
  }

  private buildContent(entities: TextEntity[]): string {
    return entities.map((e: TextEntity) => {
      return this.convertToHtml(e);
    }).join('');
  }

  public async start(): Promise<void> {
    if (await this.gitService.repoExists()) {
      await this.gitService.pull();

      try {
        if ((await readdir(this.postsDir).catch(() => [])).length > 0) return;
      } catch (err) {
        // ignore
      }
    } else {
      await this.gitService.clone();
      await this.gitService.assignAuthor();
    }

    try {
      await access(this.jsonFile);
    } catch (err) {
      return;
    }

    await this.extractPosts();
    try {
      await Promise.all([
        mkdir(this.postsDir, { recursive: true }),
        mkdir(this.postImagesDir, { recursive: true }),
      ]);
    } catch (err) {
      if ((<NodeJS.ErrnoException>err).code !== 'EEXIST') {
        throw err;
      }
    }

    for (const post of this.posts) {
      await this.postService.savePost(post);
    }
    await this.gitService.commitAndPush('Add initial posts');

    this.posts = [];
  }

  private convertToHtml(entity: TextEntity): string {
    entity.text = entity.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    switch (entity.type) {
      case 'bold':
        return `<strong>${entity.text}</strong>`;
      case 'italic':
        return `<em>${entity.text}</em>`;
      case 'underline':
        return `<u>${entity.text}</u>`;
      case 'strikethrough':
        return `<del>${entity.text}</del>`;
      case 'blockquote':
        return `<blockquote>${entity.text.replace(/</g, '<br>')}</blockquote>`;
      case 'code':
        return `<code>${entity.text}</code>`;
      case 'pre':
        return `{% highlight ${entity.language} %}\n${entity.text}\n{% endhighlight %}`;
      case 'link':
        return `<a href="${entity.text}">${entity.text}</a>`;
      case 'text_link':
        return `<a href="${entity.href}">${entity.text}</a>`;
      case 'spoiler':
        return `<span class="spoiler">${entity.text}</span>`;
      case 'mention':
        return `<a href="https://t.me/${entity.text.replace('@', '')}">${entity.text}</a>`;
      default:
        return entity.text.replace(/\n/g, '  \n');
    }
  }
}
