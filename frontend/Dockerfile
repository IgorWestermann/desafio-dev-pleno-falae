FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY src ./src

RUN pnpm run build

EXPOSE 4173

CMD ["pnpm", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "4173"]
