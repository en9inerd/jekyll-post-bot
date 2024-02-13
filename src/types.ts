export type ChannelPost = {
  id: string | bigInt.BigInteger;
  title: string;
  content: string;
  date: string;
  media: string[];
};

export type TextEntity = {
  type: string;
  text: string;
  href?: string;
  language?: string;
};
