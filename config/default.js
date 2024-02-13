import { readFile } from 'fs/promises';
import dotenv from 'dotenv'; // it's only for dev environment, don't use dotenv on production

dotenv.config();

const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url))).version;

export default {
    botConfig: {
        botDataDir: process.env.TG_BOT_DIR_INFO || './botData', // absolute path or relative to the project root
        apiId: parseInt(process.env.TG_BOT_API_ID),
        apiHash: process.env.TG_BOT_API_HASH,
        token: process.env.TG_BOT_TOKEN,
        appVersion: process.env.TG_BOT_APP_VERSION || version,
        useWSS: process.env.TG_BOT_USE_WSS?.toLowerCase() === 'true',

        channelId: process.env.TG_BOT_CHANNEL_ID,
        exportedDataDir: process.env.TG_BOT_EXPORTED_DATA_DIR, // absolute path
    },
    git: {
        accessToken: process.env.GIT_ACCESS_TOKEN,
        repoDir: process.env.GIT_REPO_DIR || './microblog', // absolute path or relative to the project root
        repoUrl: process.env.GIT_REPO_URL,
        branch: process.env.GIT_BRANCH || 'master',
    }
};
