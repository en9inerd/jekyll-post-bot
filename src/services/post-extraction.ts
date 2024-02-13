import { injectable } from 'telebuilder/decorators';
import { ChannelPost, TextEntity } from '../types.js';
import { config } from 'telebuilder/config';
import { join as joinPaths } from 'node:path';
import { readFile } from 'node:fs/promises';

@injectable
export class PostExtractionService {
  private readonly dir = config.get<string>('botConfig.exportedDataDir');
  private readonly jsonFile = joinPaths(this.dir, 'result.json');
  private readonly channelId = config.get<string>('botConfig.channelId');

  constructor() { }

  public async getPosts(): Promise<string[]> {
    const data = JSON.parse(await readFile(this.jsonFile, 'utf-8'));
    const posts = [];

    for (const [i, m] of data.messages.entries()) {
      const content = m.text_entities.map((e: TextEntity) => {
        return this.convertToMarkdownOrHtml(e);
      }).join('');

      if (m.photo && m.text === '' && m.date_unixtime === data.messages[i - 1].date_unixtime) {
        posts[posts.length - 1].media.push(m.photo);
        continue;
      }

      const post: ChannelPost = {
        id: m.id,
        date: m.date_unixtime,
        content,
        title: this.channelId,
        media: (m.photo ? [m.photo] : [])
      };

      posts.push(post);
    }

    return [];
  }

  private convertToMarkdownOrHtml(entity: TextEntity): string {
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
        return `> ${entity.text.replaceAll('\n', '<br>')}`;
      case 'code':
        return `\`${entity.text}\``;
      case 'pre':
        return `\`\`\`${entity.language}\n${entity.text}\n\`\`\``;
      case 'text_link':
        return `[${entity.text}](${entity.href})`;
      case 'spoiler':
        return `<span class="spoiler">${entity.text}</span>`;
      case 'mention':
        return `[${entity.text}](https://t.me/${entity.text.replace('@', '')})`;
      default:
        return entity.text;
    }
  }
}
