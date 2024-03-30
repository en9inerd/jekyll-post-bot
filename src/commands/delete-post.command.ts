import { config } from 'telebuilder/config';
import { command, handler, inject, params } from 'telebuilder/decorators';
import { Command, CommandParamsSchema, CommandScope, MessageWithParams } from 'telebuilder/types';
import { DeletePostParams } from '../types.js';
import { NewMessageEvent } from 'telegram/events/index.js';
import { PostService } from '../services/post.service.js';
import { formatErrorMessage } from 'telebuilder/utils';

const channelAuthor = config.get<string>('botConfig.channelAuthor');
const channelId = config.get<string>('botConfig.channelId');

@command
export class DeletePostCommand implements Command {
  command = 'delete_post';
  description = 'Delete a post from blog by id';
  scopes: CommandScope[] = [
    {
      name: 'Peer',
      peer: channelAuthor,
    },
  ];
  langCodes = [];
  @params params: CommandParamsSchema = {
    ids: {
      type: 'string',
      required: true,
    },
    revoke: {
      type: 'boolean',
      required: false,
    },
  };

  @inject(PostService)
  private postService!: PostService;

  @handler({
    event: {
      fromUsers: [channelAuthor],
    }
  })
  async entryHandler(event: NewMessageEvent) {
    if (!event.client || !event?.message?.senderId) return;

    const params = (<MessageWithParams<DeletePostParams>>event.message).params;

    if (!params?.ids) return;

    try {
      await this.postService.deletePost(params.ids);

      if (params.revoke) {
        const messageIds = params.ids.split(',').map(id => parseInt(id));
        await event.client.deleteMessages(channelId, messageIds, { revoke: true });
      }
    } catch (e) {
      await event.client.sendMessage(event.message.senderId, {
        message: `Error deleting post(s) with id(s) ${params.ids}: ${formatErrorMessage(<Error>e)}`,
      });

      return;
    }
    await event.client.sendMessage(event.message.senderId, {
      message: `Post(s) with id(s) ${params.ids} deleted successfully!`,
    });
  }
}
