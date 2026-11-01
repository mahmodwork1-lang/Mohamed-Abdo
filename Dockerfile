FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN mkdir -p bin && ln -sf /usr/bin/ffmpeg bin/ffmpeg && ln -sf /usr/bin/ffprobe bin/ffprobe \
 && curl -fsSL -o bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux$( [ "$(uname -m)" = "aarch64" ] && echo _aarch64 )" && chmod +x bin/yt-dlp
ENV PORT=3100 TRUST_PROXY=1
EXPOSE 3100
CMD ["node", "server.js"]
