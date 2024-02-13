import { NewMessageEvent, Raw } from 'telegram/events';
import type { Command, CommandScope } from 'telebuilder/types';
import { client, command, handler, inject } from 'telebuilder/decorators';
import { eventManager } from 'telebuilder/event-manager';
import { Api, TelegramClient } from 'telegram';
import { config } from 'telebuilder/config';
import bigInt from 'big-integer';
import { getImageFormat } from 'telebuilder/utils';
import { AlbumEvent } from 'telegram/events/Album.js';
import { ChannelPost } from '../types.js';
import { PostExtractionService } from '../services/post-extraction.js';
import { EditedMessageEvent } from 'telegram/events/EditedMessage.js';

@command
export class StartCommand implements Command {
  command = 'start';
  description = 'Start the bot';
  scopes: CommandScope[] = [];
  langCodes = [];

  @inject(PostExtractionService)
  private readonly oldPostExtractorService!: PostExtractionService;

  constructor() {
    eventManager.on('onInit', async (client: TelegramClient) => {
      //
    });
  }

  @handler()
  public async entryHandler(event: NewMessageEvent): Promise<void> {
    if (!event.client || !event?.message?.senderId) return;

    //
  }

  @handler({
    type: 'album',
    event: {
      chats: [config.get('botConfig.channelId')],
    },
    validateCommandParams: false,
    lock: false
  })
  public async getNewAlbum(event: AlbumEvent): Promise<void> {
    if (!event.client) return;

    //
  }

  @handler({
    type: 'newMessage',
    event: {
      chats: [config.get('botConfig.channelId')],
    },
    validateCommandParams: false,
    lock: false
  })
  public async getNewMessage(event: NewMessageEvent): Promise<void> {
    if (!event.client) return;

    //
  }

  @handler({
    type: 'editedMessage',
    event: {
      chats: [config.get('botConfig.channelId')],
    },
    validateCommandParams: false,
    lock: false
  })
  public async getEditedMessage(event: EditedMessageEvent): Promise<void> {
    if (!event.client) return;

    //
  }
}
