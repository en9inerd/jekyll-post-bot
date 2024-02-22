import { injectable } from 'telebuilder/decorators';
import { GitAuth, clone, add, commit, push, pull, setConfig, remove } from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.js';
import fs from 'node:fs';
import { config } from 'telebuilder/config';

@injectable
export class GitService {
  private readonly token = config.get<string>('git.accessToken');
  private readonly repoDir = config.get<string>('git.repoDir');
  private readonly repoUrl = config.get<string>('git.repoUrl');
  private readonly branch = config.get<string>('git.branch');

  private auth = async () => {
    return {
      username: 'token',
      password: this.token,
    } as GitAuth;
  };

  public async add(filepath: string | string[]) {
    return await add({
      dir: this.repoDir,
      filepath,
      fs,
    });
  }

  public async remove(filepath: string) {
    return await remove({
      dir: this.repoDir,
      filepath,
      fs,
    });
  }

  public async commit(message: string) {
    return await commit({
      dir: this.repoDir,
      message,
      fs,
    });
  }

  public async clone() {
    return await clone({
      url: this.repoUrl,
      dir: this.repoDir,
      singleBranch: true,
      ref: this.branch,
      depth: 1,
      fs,
      http,
      onAuth: this.auth,
    });
  }

  public async pull() {
    return await pull({
      dir: this.repoDir,
      fs,
      http,
      singleBranch: true,
      ref: this.branch,
      onAuth: this.auth,
    });
  }

  public async push() {
    return await push({
      dir: this.repoDir,
      fs,
      http,
      ref: this.branch,
      onAuth: this.auth,
    });
  }

  public async assignAuthor() {
    await setConfig({
      dir: this.repoDir,
      fs,
      path: 'user.name',
      value: config.get<string>('git.author.name'),
    });

    await setConfig({
      dir: this.repoDir,
      fs,
      path: 'user.email',
      value: config.get<string>('git.author.email'),
    });
  }

  public async repoExists() {
    try {
      await fs.promises.access(this.repoDir);
      return true;
    } catch (err) {
      return false;
    }
  }
}
