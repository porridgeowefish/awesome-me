FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV FFMPEG_BIN=/usr/bin/ffmpeg

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 SITE_DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
RUN node -e "const f=require('ffmpeg-static');if(!f)throw new Error('FFmpeg unavailable');require('node:child_process').execFileSync(f,['-version'],{stdio:'inherit'})"
COPY --from=build /app/public/.build ./public/.build
COPY --from=build /app/server ./server
COPY --from=build /app/src/contracts ./src/contracts
COPY --from=build /app/src/data ./src/data
COPY --from=build /app/tools/build/content ./tools/build/content
COPY --from=build /app/tools/scripts/lib ./tools/scripts/lib
COPY --from=build /app/public/content ./public/content
COPY --from=build /app/tools/cli ./tools/cli
COPY --from=build /app/tools/skills ./tools/skills
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/start.ts"]
