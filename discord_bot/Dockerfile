# ---------- Stage 1: build (com dependências de dev)
FROM node:18-alpine AS builder

# Só o que precisa pra compilar módulos nativos
RUN apk add --no-cache --virtual .build-deps \
    python3 make g++ \
  && apk add --no-cache libc6-compat

WORKDIR /app

# Copia manifestos primeiro pra aproveitar cache
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

# Copia o resto e builda
COPY . .
RUN yarn build

# ---------- Stage 2: deps de produção (sem dev)
FROM node:18-alpine AS prod-deps
WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile --production=true \
  && yarn cache clean

# ---------- Stage 3: runtime (mínimo necessário pra rodar)
FROM node:18-alpine AS runtime

# Só o que o bot precisa em runtime
RUN apk add --no-cache ffmpeg tzdata \
  && addgroup -g 1001 -S nodejs \
  && adduser -S discordbot -u 1001 -G nodejs

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

# Leva só artefatos e deps de produção
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder  /app/dist         ./dist
COPY --from=builder  /app/package.json ./package.json

USER discordbot

# Opcional: porta "simbólica" se você expõe HTTP
# EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Bot is running')" || exit 1

# Se seu start roda node dist/index.js, prefira chamar direto
CMD ["node", "dist/index.js"]