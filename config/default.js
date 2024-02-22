import { readFile } from 'fs/promises';

if (process.env.NODE_ENV?.toLocaleLowerCase() !== 'production') {
    (await import('dotenv')).config();
}

const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url))).version;

export default {
    botConfig: {
        botDataDir: process.env.TG_BOT_DATA_DIR || './botData', // absolute path or relative to the project root
        apiId: parseInt(process.env.TG_BOT_API_ID),
        apiHash: process.env.TG_BOT_API_HASH,
        token: process.env.TG_BOT_TOKEN,
        appVersion: process.env.TG_BOT_APP_VERSION || version,
        useWSS: process.env.TG_BOT_USE_WSS?.toLowerCase() === 'true',

        channelId: process.env.TG_BOT_CHANNEL_ID,
        channelAuthor: process.env.TG_BOT_CHANNEL_AUTHOR,
        exportedDataDir: process.env.TG_BOT_EXPORTED_DATA_DIR || 'undefined', // absolute path or relative to the project root
    },
    git: {
        accessToken: process.env.GIT_ACCESS_TOKEN,
        repoDir: process.env.GIT_REPO_DIR || './microblog', // absolute path or relative to the project root
        postsDir: process.env.GIT_POSTS_DIR || '_collection_name', // relative to the repoDir
        repoUrl: process.env.GIT_REPO_URL,
        branch: process.env.GIT_BRANCH || 'master',
        author: {
            name: process.env.GIT_AUTHOR_NAME,
            email: process.env.GIT_AUTHOR_EMAIL,
        },
        postImagesDir: process.env.GIT_POST_IMAGES_DIR || 'i',
    }
};
