import { inject, injectable } from 'telebuilder/decorators';
import { ChannelPost, ExportedMessage, TextEntity } from '../types.js';
import { config } from 'telebuilder/config';
import { join as joinPaths } from 'node:path';
import { readFile, mkdir, readdir, access } from 'node:fs/promises';
import { PostHelper } from '../helpers/post.helper.js';
import { GitService } from './git.service.js';
import { PostService } from './post.service.js';

@injectable
export class ChannelExportService {
  private readonly repoDir = config.get<string>("git.repoDir");
  private readonly exportedDataDir = config.get<string>('botConfig.exportedDataDir');
  private readonly jsonFile = joinPaths(this.exportedDataDir, 'result.json');
  private readonly postsDir = joinPaths(
    this.repoDir,
    config.get<string>('git.postsDir')
  );
  private readonly postImagesDir = joinPaths(
    this.repoDir,
    config.get<string>('git.postImagesDir')
  );
  private posts: ChannelPost[] = [];

  @inject(GitService)
  private gitService!: GitService;

  @inject(PostService)
  private postService!: PostService;

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
        if (content) this.posts[this.posts.length - 1].content = content;
        this.posts[this.posts.length - 1].title = PostHelper.setTitle(content);
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
      await access(this.exportedDataDir);
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
      await this.postService.savePosts(post);
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
