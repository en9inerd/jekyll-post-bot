import { inject, injectable } from 'telebuilder/decorators';
import { ChannelPost, ExportedMessage, TextEntity } from '../types.js';
import { config } from 'telebuilder/config';
import { join as joinPaths } from 'node:path';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { GitService } from './git.service.js';

@injectable
export class ChannelExportService {
  private readonly dir = config.get<string>('botConfig.exportedDataDir');
  private readonly jsonFile = joinPaths(this.dir, 'result.json');
  private readonly channelId = config.get<string>('botConfig.channelId');
  private readonly postsDir = joinPaths(
    config.get<string>('git.repoDir'),
    config.get<string>('git.postsDir')
  );
  private readonly postImagesDir = joinPaths(
    config.get<string>('git.repoDir'),
    config.get<string>('git.postImagesDir')
  );
  private readonly relPostImagesDir = config.get<string>('git.postImagesDir');
  private readonly relPostsDir = config.get<string>('git.postsDir');
  private posts: ChannelPost[] = [];

  public setTitle: (content?: string) => string = () => this.channelId;
  public extraContentProcessor?: (content: string) => string;

  @inject(GitService)
  private gitService!: GitService;

  constructor() { }

  public async extractPosts(): Promise<void> {
    const data: {
      messages: ExportedMessage[];
    } = JSON.parse(await readFile(this.jsonFile, 'utf-8'));

    for (const [i, msg] of data.messages.entries()) {
      if (this.skipMessage(msg)) continue;

      if (msg.date_unixtime !== data.messages[i - 1]?.date_unixtime) {
        const post = this.createNewPost(msg);
        this.posts.push(post);
      } else {
        const media = msg?.photo || msg?.thumbnail;
        const content = this.buildContent(msg.text_entities);

        if (media) this.posts[this.posts.length - 1].mediaSource.push(media);
        this.posts[this.posts.length - 1].groupIds.push(msg.id);
        if (content) this.posts[this.posts.length - 1].content = content;
        this.posts[this.posts.length - 1].title = this.setTitle(content);
      }
    }
  }

  private skipMessage(msg: ExportedMessage): boolean {
    return (msg?.media_type && !['video_file', 'animation'].includes(msg.media_type)) ||
      msg?.type === 'service' ||
      msg?.date_unixtime === '0';
  }

  private createNewPost(msg: ExportedMessage): ChannelPost {
    const media = msg?.photo || msg?.thumbnail;
    const content = this.buildContent(msg.text_entities);
    return {
      id: msg.id,
      groupIds: (media ? [msg.id] : []),
      date: msg.date_unixtime,
      content,
      title: this.setTitle(content),
      mediaSource: (media ? [media] : []),
      mediaDestination: [],
      relMediaDestination: []
    };
  }

  private buildContent(entities: TextEntity[]): string {
    return entities.map((e: TextEntity) => {
      return this.convertToMdHtml(e);
    }).join('');
  }

  private addFrontMatter(): void {
    const frontMatter = `---\ntitle: "$title"\ndate: $date\nimages: [$images]\n---\n\n`;

    for (const post of this.posts) {
      const images = post.mediaSource.map((m, i) => {
        const fileName = `${post.id}_${post.groupIds[i]}.${m.split('.').pop()}`;
        const dest = joinPaths(this.postImagesDir, fileName);
        const relDest = joinPaths(this.relPostImagesDir, fileName);
        post.mediaDestination.push(dest);
        post.relMediaDestination.push(relDest);
        return `"${relDest}"`;
      });

      post.content = frontMatter
        .replace('$title', post.title)
        .replace('$date', new Date(Number(post.date) * 1000).toISOString().replace('T', ' ').replace(/\.\d{3}Z/, ''))
        .replace('$images', images.join(', ')) + post.content + '\n';
    }
  }

  private async saveAndPushPosts(): Promise<void> {
    try {
      await mkdir(this.postsDir, { recursive: true });
      await mkdir(this.postImagesDir, { recursive: true });
    } catch (err) {
      if ((<NodeJS.ErrnoException>err).code !== 'EEXIST') {
        throw err;
      }
    }

    for (const post of this.posts) {
      const filename = `${post.id}.md`;
      const filepath = joinPaths(this.postsDir, filename);

      await writeFile(filepath, post.content, 'utf-8');
      await this.gitService.add(joinPaths(this.relPostsDir, filename));

      for (const [i, imagePath] of post.mediaSource.entries()) {
        const sourceImagePath = joinPaths(this.dir, imagePath);

        await writeFile(post.mediaDestination[i],
          await readFile(sourceImagePath, 'binary'),
          'binary'
        );
        await this.gitService.add(post.relMediaDestination[i]);
      }
    }
    await this.gitService.commit('Add initial posts');
    await this.gitService.push();
  }

  public async start(): Promise<void> {
    if (await this.gitService.repoExists()) {
      await this.gitService.pull();

      try {
        const files = await readdir(this.postsDir);
        if (files.length > 0) return;
      } catch (err) {
        // ignore
      }
    } else {
      await this.gitService.clone();
      await this.gitService.assignAuthor();
    }

    await this.extractPosts();
    this.addFrontMatter();
    if (this.extraContentProcessor) {
      for (const p of this.posts) {
        p.content = this.extraContentProcessor(p.content);
      }
    }
    await this.saveAndPushPosts();

    this.posts = [];
  }

  private convertToMdHtml(entity: TextEntity): string {
    switch (entity.type) {
      case 'bold':
        return `**${entity.text}**`;
      case 'italic':
        return `*${entity.text}*`;
      case 'underline':
        return `<u>${entity.text}</u>`;
      case 'strikethrough':
        return `~~${entity.text}~~`;
      case 'blockquote':
        return `> ${entity.text.replaceAll('\n', '  \n')}\n`;
      case 'code':
        return `\`${entity.text}\``;
      case 'pre':
        return `\n\`\`\`${entity.language}\n${entity.text}\n\`\`\`\n`;
      case 'text_link':
        return `[${entity.text}](${entity.href})`;
      case 'spoiler':
        return `<span class="spoiler">${entity.text}</span>`;
      case 'mention':
        return `[${entity.text}](https://t.me/${entity.text.replace('@', '')})`;
      default:
        return entity.text.replaceAll('\n', '  \n');
    }
  }
}
