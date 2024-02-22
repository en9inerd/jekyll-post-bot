export type ChannelPost = {
  id: number;
  title: string;
  content: string;
  date: string | number;
  mediaSource: string[];
  mediaDestination: string[];
  relMediaDestination: string[];
};

export type TextEntity = {
  type: string;
  text: string;
  href?: string;
  language?: string;
};

export type ExportedMessage = {
  id: number;
  date_unixtime: string | number;
  text: string;
  text_entities: TextEntity[];
  photo?: string;
  thumbnail?: string;
  media_type?: string;
  type: string;
};

export type DeletePostParams = {
  ids: string;
};

export type SyncChannelInfoParams = {
  logo: boolean;
  stat: boolean;
};
