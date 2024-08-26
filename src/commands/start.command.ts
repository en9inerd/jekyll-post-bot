import { config } from 'telebuilder/config';
import { catchError, command, handler, inject } from 'telebuilder/decorators';
import { eventManager } from 'telebuilder/event-manager';
import type { Command, CommandScope } from 'telebuilder/types';
import type { TelegramClient } from 'telegram';
import type { NewMessageEvent } from 'telegram/events';
import type { AlbumEvent } from 'telegram/events/Album.js';
import type { EditedMessageEvent } from 'telegram/events/EditedMessage.js';
import PostHelper from '../helpers/post.helper.js';
import { ChannelExportService } from '../services/channel-export.service.js';
import { PostService } from '../services/post.service.js';

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

  @inject(ChannelExportService)
  private channelExportService!: ChannelExportService;

  @inject(PostService)
  private postService!: PostService;

  constructor() {
    eventManager.on('onInit', async (client: TelegramClient) => {
      try {
        client.setParseMode('html');
        this.setupContentProcessors();
        await this.channelExportService.start();
      } catch (e) {
        console.error(e);
      }
    });
  }

  private setupContentProcessors(): void {
    const addressRegex = /(\s\s\n)?0x[0-9a-fA-F]+\n?$/;

    PostHelper.setTitle = (content?: string) => {
      const match = content?.match(addressRegex);
      return match ? `${channelId} [${match[0].trim()}]` : channelId;
    };
    PostHelper.extraContentProcessor = (content: string) => {
      return content.replace(addressRegex, '');
    };
  }

  @handler({
    event: {
      fromUsers: [channelAuthor],
    }
  })
  public async entryHandler(event: NewMessageEvent): Promise<void> {
    if (!event.client || !event?.message?.senderId) return;

    // biome-ignore lint/style/useTemplate: <explanation>
    const message = `Hello, ${event.message.senderId}! Here are the available commands:\n` +
      '/delete_post - Delete a post from blog by id, params: ids (string, required), revoke (boolean, optional)\n' +
      '/sync_channel_info - Sync channel info, params: logo (boolean, required), stat (boolean, required)\n';
    await event.client.sendMessage(event.message.senderId, { message });
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
  @catchError()
  public async getNewAlbum(event: AlbumEvent): Promise<void> {
    // prevent edited messages from being processed
    if (event.messages.length === 1 || !event?.client) return;

    await this.postService.processMessage(event.client, event.messages);
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
  @catchError()
  public async getNewMessage(event: NewMessageEvent): Promise<void> {
    if (!event.client) return;
    await this.postService.processMessage(event.client, [event.message]);
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
  @catchError()
  public async getEditedMessage(event: EditedMessageEvent): Promise<void> {
    if (!event.client) return;
    await this.postService.processMessage(event.client, [event.message], true);
  }
}
