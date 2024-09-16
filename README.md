# Jekyll Post Bot

Telegram bot to copy new posts from a channel to a Jekyll blog based on GitHub Actions.

## How it works
When a new post is published in a Telegram channel, the bot will create new post in the Jekyll blog and push it to the repository.

## ASCII diagram

```
 +-------------------------+       +------------------+      +-----------------------+   
 | Telegram Channel        |       | Telegram Bot     |      | GitHub Repository     |
 |  (New Post Published)   | ----> |  Listens for     |      |  (Jekyll Blog)        |
 |                         |       |  New Posts       |      |                       |
 +-------------------------+       +------------------+      +-----------------------+
                                         |                                |
                                         |                                |
                                         v                                |
                                 +------------------+                     |
                                 |   Creates New    |                     |
                                 | Jekyll Blog Post |                     |
                                 +------------------+                     |
                                         |                                |
                                         v                                |
                                 +------------------+                     |
                                 |  Push to GitHub  | ------------------> |
                                 +------------------+                     |
                                                                          v
                                                          +-----------------------------+
                                                          | GitHub Actions Workflow     |
                                                          | (Build & Deploy)            |
                                                          +-----------------------------+
                                                                    |
                                                                    v
                                                         +----------------------------+
                                                         | Jekyll Blog Website        |
                                                         | (Post is Published)        |
                                                         +----------------------------+
```
