import { inject, injectable } from 'telebuilder/decorators';
import { ChannelPost, ExportedMessage, TextEntity } from '../types.js';
import { config } from 'telebuilder/config';
import { join as joinPaths } from 'node:path';
import { readFile, writeFile, mkdir, readdir, access, unlink } from 'node:fs/promises';
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
  private readonly postLayout = config.get<string>('git.postLayout');
  private posts: ChannelPost[] = [];

  public setTitle: (content?: string) => string = () => this.channelId;
  public extraContentProcessor?: (content: string) => string;

  public readonly frontMatter = (this.postLayout) ? `---\nlayout: ${this.postLayout}\n` : '---\n' +
    'title: "$title"\ndate: $date\nimages: [$images]\n---\n\n';

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
        if (content) this.posts[this.posts.length - 1].content = content;
        this.posts[this.posts.length - 1].title = this.setTitle(content);
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
      title: this.setTitle(content),
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

  public addFrontMatter(post: ChannelPost): void {
    const images = post.mediaSource.map((m, i) => {
      const fileName = `${post.id}_${i}.${m.split('.').pop()}`;
      const dest = joinPaths(this.postImagesDir, fileName);
      const relDest = joinPaths(this.relPostImagesDir, fileName);
      post.mediaDestination.push(dest);
      post.relMediaDestination.push(relDest);
      return `"${relDest}"`;
    });

    post.content = this.frontMatter
      .replace('$title', post.title)
      .replace('$date', new Date(Number(post.date) * 1000).toISOString().replace('T', ' ').replace(/:\d{2}\.\d{3}Z/, ''))
      .replace('$images', images.join(', ')) + post.content + '\n';
  }

  public async savePosts(post: ChannelPost, mediaFiles?: Buffer[]): Promise<void> {
    const filename = `${post.id}.md`;
    const filepath = joinPaths(this.postsDir, filename);

    await writeFile(filepath, post.content, 'utf-8');
    await this.gitService.add(joinPaths(this.relPostsDir, filename));

    post.mediaSource.map(async (imagePath, i) => {
      const sourceImagePath = joinPaths(this.dir, imagePath);
      const destImageFilePath = post.mediaDestination[i];
      const relDestImageFilePath = post.relMediaDestination[i];

      await writeFile(
        destImageFilePath,
        (mediaFiles) ? mediaFiles[i] : await readFile(sourceImagePath, 'binary'),
        'binary'
      );
      await this.gitService.add(relDestImageFilePath);
    });
  }

  public async editPost(post: ChannelPost, mediaFile?: Buffer): Promise<void> {
    const postId = post.id;
    const editablePostId = await this.getEditablePostId(post);
    const index = postId - editablePostId;
    const num = (await this.getPostImagePaths(editablePostId))?.length;

    if (post.content) {
      post.id = editablePostId;
      if (num > 0) post.mediaSource = Array(num).fill(post.mediaSource[0]);

      this.addFrontMatter(post);
      if (this.extraContentProcessor) {
        post.content = this.extraContentProcessor(post.content);
      }

      const filename = `${editablePostId}.md`;
      const filepath = joinPaths(this.postsDir, filename);

      await writeFile(filepath, post.content, 'utf-8');
      await this.gitService.add(joinPaths(this.relPostsDir, filename));
    }

    if (mediaFile) {
      const filename = `${editablePostId}_${index}.${post.mediaSource[0].split('.').pop()}`;
      const destImageFilePath = joinPaths(this.postImagesDir, filename);
      const relDestImageFilePath = joinPaths(this.relPostImagesDir, filename);

      await writeFile(destImageFilePath, mediaFile, 'binary');
      await this.gitService.add(relDestImageFilePath);
    }
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

    try {
      await access(this.dir);
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
      this.addFrontMatter(post);
      if (this.extraContentProcessor) {
        post.content = this.extraContentProcessor(post.content);
      }
      await this.savePosts(post);
    }
    await this.commitAndPush('Add initial posts');

    this.posts = [];
  }

  private async getEditablePostId(post: ChannelPost): Promise<number> {
    const postFiles: number[] = (await readdir(this.postsDir)).map((file) => {
      const fileIdString = file.split('.')[0];
      return parseInt(fileIdString, 10);
    });

    return postFiles.reduce((prev, curr) => {
      const prevDifference = Math.abs(curr - post.id);
      const currDifference = Math.abs(prev - post.id);
      return prevDifference < currDifference ? curr : prev;
    });
  }

  public async getPostImagePaths(postId: number | string): Promise<string[]> {
    const postImages = await readdir(this.postImagesDir);
    return postImages.filter((image) => image.startsWith(`${postId}_`));
  }

  public async deletePost(ids: string): Promise<void> {
    for (const id of ids.split(',')) {
      const imagePaths = await this.getPostImagePaths(id);

      try {
        await unlink(joinPaths(this.postsDir, `${id}.md`));
        await this.gitService.remove(joinPaths(this.relPostsDir, `${id}.md`));
        await Promise.all(imagePaths.map((imagePath) => unlink(joinPaths(this.postImagesDir, imagePath))));
        await Promise.all(imagePaths.map((imagePath) => this.gitService.remove(joinPaths(this.relPostImagesDir, imagePath))));
      } catch (err) {
        if ((<NodeJS.ErrnoException>err).code !== 'ENOENT') {
          throw err;
        }
      }
    }

    this.commitAndPush(`Delete post(s): ${ids}`);
  }

  public async commitAndPush(message: string): Promise<void> {
    await this.gitService.commit(message);
    await this.gitService.push();
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
