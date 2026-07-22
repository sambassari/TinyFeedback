# TinyFeedback — zero runtime npm deps; CSS built in a throwaway stage.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY src ./src
COPY public ./public
RUN npm run build:css

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3847

RUN addgroup -S tf && adduser -S tf -G tf

COPY server.js ./
COPY lib ./lib
COPY --from=build /app/public ./public
COPY data/.gitkeep ./data/.gitkeep

RUN chown -R tf:tf /app
USER tf

EXPOSE 3847
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3847/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
