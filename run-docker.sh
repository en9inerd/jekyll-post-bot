docker run -d --name jekyll-post-bot \
  --env-file .env \
  --restart unless-stopped \
  -v ./botData/:/bot/botData/ \
  jekyll-post-bot:latest
