FROM node:24.19.0-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node src ./src

USER node
EXPOSE 4000

CMD ["node", "src/server.ts"]
