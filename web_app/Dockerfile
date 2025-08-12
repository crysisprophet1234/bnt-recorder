FROM node:18-alpine AS base

# Instalar dependências necessárias incluindo OpenSSL
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    openssl-dev
WORKDIR /app

# Instalar dependências
FROM base AS deps
COPY package.json yarn.lock* ./
RUN yarn --frozen-lockfile

# Build da aplicação
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Gerar cliente Prisma com binário correto para Alpine
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl"
RUN yarn db:generate

# Build da aplicação Next.js
RUN yarn build

# Imagem de produção
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

# Criar usuário não-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar arquivos de build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Criar diretório public (Next.js pode precisar)
RUN mkdir -p ./public

# Copiar schema do Prisma e node_modules necessários
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Criar diretórios necessários
RUN mkdir -p /app/uploads /app/logs
RUN chown -R nextjs:nodejs /app/uploads /app/logs

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]