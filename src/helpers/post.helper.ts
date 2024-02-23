import { config } from "telebuilder/config";
import { ChannelPost } from "../types.js";
import { join as joinPaths } from "node:path";
import { readdir } from "node:fs/promises";

export class PostHelper {
  static readonly repoDir = config.get<string>("git.repoDir");
  static readonly postsDir = joinPaths(
    this.repoDir,
    config.get<string>("git.postsDir")
  );
  static readonly postLayout = config.get<string>('git.postLayout');
  static readonly postImagesDir = config.get<string>('git.postImagesDir');
  static readonly relPostImagesDir = config.get<string>('git.postImagesDir');
  static readonly channelId = config.get<string>('botConfig.channelId');

  static readonly frontMatter = (this.postLayout) ? `---\nlayout: ${this.postLayout}\n` : '---\n' +
    'title: "$title"\ndate: $date\nimages: [$images]\n---\n\n';

  static setTitle: (content?: string) => string = () => this.channelId;
  static extraContentProcessor?: (content: string) => string;

  static addFrontMatter(post: ChannelPost): void {
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

  static async getEditablePostId(post: ChannelPost): Promise<number> {
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

  static async getPostImagePaths(postId: number | string): Promise<string[]> {
    const postImages = await readdir(this.postImagesDir);
    return postImages.filter((image) => image.startsWith(`${postId}_`));
  }
}
