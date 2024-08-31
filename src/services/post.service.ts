import { injectable, inject } from "telebuilder/decorators";
import type { ChannelPost } from "../types.js";
import { join as joinPaths } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { config } from "telebuilder/config";
import PostHelper from '../helpers/post.helper.js';
import type { Api, TelegramClient } from "telegram";
import { getImageFormat } from "telebuilder/utils";
import { GitService } from "./git.service.js";
import { ChannelSyncService } from "./channel-sync.service.js";

@injectable
export class PostService {
  private readonly exportedDataDir = config.get<string>('botConfig.exportedDataDir');
  private readonly repoDir = config.get<string>("git.repoDir");
  private readonly postsDir = joinPaths(
    this.repoDir,
    config.get<string>("git.postsDir")
  );
  private readonly postImagesDir = joinPaths(
    this.repoDir,
    config.get<string>("git.postImagesDir")
  );
  private readonly relPostImagesDir = config.get<string>("git.postImagesDir");
  private readonly relPostsDir = config.get<string>("git.postsDir");

  // Regexes and replacers for content processing
  private readonly spoilerRegex = /<spoiler>([\s\S]*?)<\/spoiler>/g;
  private readonly spoilerReplacer = '<span class="spoiler">$1</span>';
  private readonly codeRegex = /<pre><code class="language-(.*?)">([\s\S]*?)<\/code><\/pre>/g;
  private readonly codeReplacer = '{% highlight $1 %}\n$2\n{% endhighlight %}';

  @inject(GitService)
  private gitService!: GitService;

  @inject(ChannelSyncService)
  private channelSyncService!: ChannelSyncService;

  public async savePost(post: ChannelPost, mediaFiles?: Buffer[]): Promise<void> {
    const filename = `${post.id}.md`;
    const filepath = joinPaths(this.postsDir, filename);

    PostHelper.addFrontMatter(post);
    if (PostHelper.extraContentProcessor) {
      post.content = PostHelper.extraContentProcessor(post.content);
    }

    await PostHelper.checkAndCreateDirectory(this.postsDir);
    await writeFile(filepath, post.content, 'utf-8');
    await this.gitService.add(joinPaths(this.relPostsDir, filename));

    post.mediaSource.map(async (imagePath, i) => {
      const sourceImagePath = joinPaths(this.exportedDataDir, imagePath);
      const destImageFilePath = post.mediaDestination[i];
      const relDestImageFilePath = post.relMediaDestination[i];

      await PostHelper.checkAndCreateDirectory(this.postImagesDir);
      await writeFile(
        destImageFilePath,
        (mediaFiles) ? mediaFiles[i] : await readFile(sourceImagePath, 'binary'),
        'binary'
      );
      await this.gitService.add(relDestImageFilePath);
    });

    // update the number of posts in the _config.yml file
    await this.channelSyncService.syncChannelInfo({
      numOfPosts: true
    });
  }

  public async editPost(post: ChannelPost, mediaFile?: Buffer): Promise<void> {
    const postId = post.id;
    const editablePostId = await PostHelper.getEditablePostId(post);
    const index = postId - editablePostId;
    const numOfMediaFiles = (await PostHelper.getPostImagePaths(editablePostId))?.length;

    if (post.content) {
      post.id = editablePostId;
      if (numOfMediaFiles > 0) post.mediaSource = Array(numOfMediaFiles).fill(post.mediaSource[0]);

      PostHelper.addFrontMatter(post);
      if (PostHelper.extraContentProcessor) {
        post.content = PostHelper.extraContentProcessor(post.content);
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

      await PostHelper.checkAndCreateDirectory(this.postImagesDir);
      await writeFile(destImageFilePath, mediaFile, 'binary');
      await this.gitService.add(relDestImageFilePath);
    }
  }

  public async deletePost(ids: string): Promise<void> {
    for (const id of ids.split(',')) {
      const imagePaths = await PostHelper.getPostImagePaths(id);

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

    // update the number of posts in the _config.yml file
    await this.channelSyncService.syncChannelInfo({
      numOfPosts: true
    });

    await this.gitService.commitAndPush(`Delete post(s): ${ids}`);
  }

  private createNewPost(msg: Api.Message): ChannelPost {
    const content = (msg.text ? this.buildContent(msg.text) : '');

    return {
      id: msg.id,
      date: msg.date,
      content,
      title: PostHelper.setTitle(content),
      mediaSource: [],
      mediaDestination: [],
      relMediaDestination: []
    };
  }

  private buildContent(text: string): string {
    // escape all < and > characters between <code> and </code> tags
    text = text.replace(/<code>([\s\S]*?)<\/code>/g, (match, codeContent) => {
      const escapedCodeContent = codeContent.replace(/[<>]/g, (char: string) => {
        return char === '<' ? '&lt;' : '&gt;';
      });
      return `<code>${escapedCodeContent}</code>`;
    });

    const sections = text.split(/(<pre>.*?<\/pre>|<blockquote>.*?<\/blockquote>)/s);
    const modifiedSections = sections.map(section => {
      if (section.startsWith('<pre>') || section.startsWith('<blockquote>')) {
        if (section.startsWith('<blockquote>')) return section.replace(/\n/g, '<br>');
        return section;
      }
      return section.replace(/\n/g, '  \n');
    });

    return modifiedSections.join('')
      .replace(this.spoilerRegex, this.spoilerReplacer)
      .replace(this.codeRegex, this.codeReplacer);
  }

  private skipMessage(msg: Api.Message | Api.MessageService): boolean {
    // Skip messages that are not videos, animations, photos, or text.
    // Also skip service messages, messages with no date and forwarded messages.
    return !(msg.photo || msg.video || msg.gif || msg.text) ||
      msg.className === 'MessageService' ||
      !!msg.fwdFrom ||
      msg.date === 0;
  }

  public async processMessage(
    client: TelegramClient,
    messages: Api.Message[],
    edit = false,
    commitAndPush = true
  ): Promise<void> {
    let post = <ChannelPost>{};
    const mediaFiles = [];

    for (const [i, msg] of messages.entries()) {
      if (this.skipMessage(msg)) continue;

      if (i === 0) post = this.createNewPost(msg);
      else {
        if (msg.text) {
          post.content = this.buildContent(msg.text);
          post.title = PostHelper.setTitle(post.content);
        }
      }

      if (msg.photo || msg.video || msg.gif) {
        let thumb = undefined;
        if (msg.photo) thumb = 2;
        else if (msg.video) thumb = 0;

        const mediaFile = <Buffer>(await client.downloadMedia(msg, {
          thumb,
        }));
        mediaFiles.push(mediaFile);
        const imageFormat = getImageFormat(mediaFile);
        const mediaPath = `.${imageFormat}`;
        post.mediaSource.push(mediaPath);
      }
    }

    if (Object.keys(post).length === 0) return;

    if (edit) {
      await this.editPost(
        post,
        (mediaFiles.length > 0 ? mediaFiles[0] : undefined)
      );
    }
    else {
      await this.savePost(post, mediaFiles);
    }

    if (commitAndPush) {
      await this.gitService.commitAndPush(`${(edit ? 'Edited' : 'Created new')} post: ${post.id}`);
    }
  }
}
