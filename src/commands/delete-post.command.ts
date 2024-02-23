import { config } from 'telebuilder/config';
import { command, handler, inject, params } from 'telebuilder/decorators';
import { Command, CommandParamsSchema, CommandScope, MessageWithParams } from 'telebuilder/types';
import { PostService } from '../services/index.js';
import { DeletePostParams } from '../types.js';
import { NewMessageEvent } from 'telegram/events/index.js';

const channelAuthor = config.get<string>('botConfig.channelAuthor');

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
    }
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

    await this.postService.deletePost(params.ids);
    await event.client.sendMessage(event.message.senderId, {
      message: `Post(s) with id(s) ${params.ids} deleted successfully!`,
    });
  }
}
