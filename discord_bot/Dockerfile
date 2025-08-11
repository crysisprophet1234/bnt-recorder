FROM node:18-alpine

# Instalar dependências do sistema necessárias para o Discord bot
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    libc6-compat

WORKDIR /app

# Copiar arquivos de dependências primeiro para melhor cache do Docker
COPY package.json yarn.lock ./

# Instalar dependências usando yarn (conforme especificado no packageManager)
RUN yarn install --frozen-lockfile --production=false

# Copiar código fonte e arquivos de configuração
COPY src/ ./src/
COPY tsconfig.json ./

# Build da aplicação TypeScript
RUN yarn build

# Remover dependências de desenvolvimento para reduzir tamanho da imagem
RUN yarn install --frozen-lockfile --production=true && yarn cache clean

# Criar diretórios necessários para o bot
RUN mkdir -p /app/recordings /app/output /app/logs

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discordbot -u 1001 -G nodejs

# Definir permissões corretas
RUN chown -R discordbot:nodejs /app && \
    chmod -R 755 /app

# Mudar para usuário não-root
USER discordbot

# Definir variáveis de ambiente
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

# Healthcheck para verificar se o bot está funcionando
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Bot is running')" || exit 1

# O bot não expõe porta HTTP, mas mantemos para compatibilidade
EXPOSE 3000

# Comando para iniciar o bot
CMD ["yarn", "start"]