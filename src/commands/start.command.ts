import { NewMessageEvent } from 'telegram/events';
import type { Command, CommandScope } from 'telebuilder/types';
import { command, handler, inject } from 'telebuilder/decorators';
import { eventManager } from 'telebuilder/event-manager';
import { Api, TelegramClient } from 'telegram';
import { config } from 'telebuilder/config';
import { AlbumEvent } from 'telegram/events/Album.js';
import { ChannelExportService } from '../services/index.js';
import { ChannelPost } from '../types.js';
import { getImageFormat } from 'telebuilder/utils';
import { EditedMessageEvent } from 'telegram/events/EditedMessage.js';

const channelId = config.get<string>('botConfig.channelId');
const channelAuthor = config.get<string>('botConfig.channelAuthor');

@command
export class StartCommand implements Command {
  command = 'start';
  description = 'Start the bot';
  scopes: CommandScope[] = [
    {
      name: 'Peer',
      peer: channelAuthor
    },
  ];
  langCodes = [];

  private readonly addressRegex = /(\s\s\n)?0x[0-9a-fA-F]+\n?$/;
  private readonly spoilerRegex = /<spoiler>([\s\S]*?)<\/spoiler>/g;
  private readonly spoilerReplacer = '<span class="spoiler">$1</span>';
  private readonly codeRegex = /<pre><code class="language-(.*?)">([\s\S]*?)<\/code><\/pre>/g;
  private readonly codeReplacer = '{% highlight $1 %}\n$2\n{% endhighlight %}';

  @inject(ChannelExportService)
  private channelExportService!: ChannelExportService;

  constructor() {
    eventManager.on('onInit', async (client: TelegramClient) => {
      try {
        client.setParseMode('html');
        this.setupChannelExportService();
        await this.channelExportService.start();
      } catch (e) {
        console.error(e);
      }
    });
  }

  private setupChannelExportService() {
    this.channelExportService.setTitle = (content?: string) => {
      const match = content?.match(this.addressRegex);
      return match ? channelId + ` [${match[0].trim()}]` : channelId;
    };
    this.channelExportService.extraContentProcessor = (content: string) => {
      return content.replace(this.addressRegex, '');
    };
  }

  @handler({
    event: {
      fromUsers: [channelAuthor],
    }
  })
  public async entryHandler(event: NewMessageEvent): Promise<void> {
    if (!event.client || !event?.message?.senderId) return;
  }

  @handler({
    type: 'album',
    event: {
      chats: [channelId],
      incoming: true,
      outgoing: false,
    },
    validateCommandParams: false,
    lock: false
  })
  public async getNewAlbum(event: AlbumEvent): Promise<void> {
    // prevent edited messages from being processed
    if (event.messages.length === 1 || !event?.client) return;

    await this.processMessage(event.client, event.messages);
  }

  @handler({
    type: 'newMessage',
    event: {
      chats: [channelId],
      incoming: true,
      outgoing: false,
      func: (event: NewMessageEvent) => !event.message?.groupedId
    },
    validateCommandParams: false,
    lock: false
  })
  public async getNewMessage(event: NewMessageEvent): Promise<void> {
    if (!event.client) return;
    await this.processMessage(event.client, [event.message]);
  }

  @handler({
    type: 'editedMessage',
    event: {
      incoming: true,
      outgoing: false,
      chats: [channelId]
    },
    validateCommandParams: false,
    lock: false
  })
  public async getEditedMessage(event: EditedMessageEvent): Promise<void> {
    if (!event.client) return;
    await this.processMessage(event.client, [event.message], true);
  }

  private buildContent(text: string): string {
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

  private createNewPost(msg: Api.Message): ChannelPost {
    const content = (msg.text ? this.buildContent(msg.text) : '');

    return {
      id: msg.id,
      date: msg.date,
      content,
      title: this.channelExportService.setTitle(content),
      mediaSource: [],
      mediaDestination: [],
      relMediaDestination: []
    };
  }

  private skipMessage(msg: Api.Message | Api.MessageService): boolean {
    // Skip messages that are not videos, animations, photos, or text.
    // Also skip service messages, messages with no date and forwarded messages.
    return (msg.media && !(msg.photo || msg.video || msg.gif)) ||
      msg.className === 'MessageService' ||
      !!msg.fwdFrom ||
      msg.date === 0;
  }

  private async processMessage(
    client: TelegramClient,
    messages: Api.Message[],
    edit?: boolean
  ): Promise<void> {
    let post = <ChannelPost>{};
    const mediaFiles = [];

    for (const [i, msg] of messages.entries()) {
      if (this.skipMessage(msg)) continue;

      if (i === 0) post = this.createNewPost(msg);
      else {
        if (msg.text) {
          post.content = this.buildContent(msg.text);
          post.title = this.channelExportService.setTitle(post.content);
        }
      }

      if (msg.media) {
        let thumb;
        if (msg.photo) thumb = 1;
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

    if (edit) {
      await this.channelExportService.editPost(
        post,
        (mediaFiles.length > 0 ? mediaFiles[0] : undefined)
      );
    }
    else {
      this.channelExportService.addFrontMatter(post);
      if (this.channelExportService.extraContentProcessor) {
        post.content = this.channelExportService.extraContentProcessor(post.content);
      }
      await this.channelExportService.savePosts(post, mediaFiles);
    }
    await this.channelExportService.commitAndPush(`${(edit ? 'Edited' : 'Created new')} post: ${post.id}`);
  }
}
