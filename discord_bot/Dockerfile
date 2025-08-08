FROM node:18-alpine

# Instalar FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build

# Criar diretórios necessários
RUN mkdir -p recordings output

# Usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S discordbot -u 1001
RUN chown -R discordbot:nodejs /app
USER discordbot

EXPOSE 3001

CMD ["npm", "start"]