FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json prisma7.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY test ./test

RUN pnpm exec prisma generate && pnpm run build

EXPOSE 3333

CMD ["pnpm", "start"]
