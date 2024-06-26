import { constants, access, mkdir, readdir } from "node:fs/promises";
import { join as joinPaths } from "node:path";
import { config } from "telebuilder/config";
import { HelperException } from "telebuilder/exceptions";
import type { ChannelPost } from "../types.js";

class PostHelper {
  private readonly repoDir = config.get<string>("git.repoDir");
  private readonly postsDir = joinPaths(
    this.repoDir,
    config.get<string>("git.postsDir")
  );
  private readonly postImagesDir = joinPaths(
    this.repoDir,
    config.get<string>("git.postImagesDir")
  );
  private readonly postLayout = config.get<string>('git.postLayout');
  private readonly relPostImagesDir = config.get<string>('git.postImagesDir');
  private readonly channelId = config.get<string>('botConfig.channelId');

  private readonly frontMatter = (this.postLayout) ? `---\nlayout: ${this.postLayout}\n` : '---\n' +
    'title: "$title"\ndate: $date\nimages: [$images]\n---\n\n';

  setTitle: (content?: string) => string = () => this.channelId;
  extraContentProcessor?: (content: string) => string;

  addFrontMatter(post: ChannelPost): void {
    const images = post.mediaSource.map((m, i) => {
      const fileName = `${post.id}_${i}.${m.split('.').pop()}`;
      const dest = joinPaths(this.postImagesDir, fileName);
      const relDest = joinPaths(this.relPostImagesDir, fileName);
      post.mediaDestination.push(dest);
      post.relMediaDestination.push(relDest);
      return `"${relDest}"`;
    });

    post.content = `${this.frontMatter
      .replace('$title', post.title)
      .replace('$date', new Date(Number(post.date) * 1000).toISOString().replace('T', ' ').replace(/:\d{2}\.\d{3}Z/, ''))
      .replace('$images', images.join(', ')) + post.content}\n`;
  }

  async getEditablePostId(post: ChannelPost): Promise<number> {
    const postFiles: number[] = (await readdir(this.postsDir)).map((file) => {
      const fileIdString = file.split('.')[0];
      return Number.parseInt(fileIdString, 10);
    });

    return postFiles.reduce((prev, curr) => {
      const prevDifference = Math.abs(curr - post.id);
      const currDifference = Math.abs(prev - post.id);
      return prevDifference < currDifference ? curr : prev;
    });
  }

  async getPostImagePaths(postId: number | string): Promise<string[]> {
    const postImages = await readdir(this.postImagesDir).catch(() => []);
    return postImages.filter((image) => image.startsWith(`${postId}_`));
  }

  async checkAndCreateDirectory(dir: string): Promise<void> {
    try {
      await access(dir, constants.F_OK);
    } catch (error) {
      try {
        await mkdir(dir, { recursive: true });
      } catch (mkdirError) {
        // we can't continue without the directory
        throw new HelperException(`Error creating directory: ${(<Error>mkdirError).message}`);
      }
    }
  }
}

export default new PostHelper;
