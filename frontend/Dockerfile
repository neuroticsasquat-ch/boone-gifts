FROM node:22-slim AS dev
# pnpm at the version package.json's packageManager pins, via Corepack. No prompt:
# the build has no TTY to answer Corepack's download question.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 5173
CMD ["pnpm", "run", "dev"]
