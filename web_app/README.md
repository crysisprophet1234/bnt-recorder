# Discord Recorder Web App

Uma aplicação web Next.js para gerenciar gravações do Discord com suporte a armazenamento local e S3.

## 🚀 Para inicializar o projeto

### 1. Instalar dependências
```bash
yarn install
```

### 2. Configurar variáveis de ambiente
Crie um arquivo `.env` seguindo o `.env.example`:
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:
- **DATABASE_URL**: URL de conexão com o PostgreSQL
- **N8N_WEBHOOK_URL**: URL do webhook do N8N
- **STORAGE_TYPE**: Tipo de armazenamento (`local` ou `s3`)
- Configure as variáveis de armazenamento conforme sua escolha

### 3. Configurar banco de dados
Execute as migrações do Prisma:
```bash
yarn db:push
```

Gere o cliente Prisma:
```bash
yarn db:generate
```

### 4. Executar o projeto
Para desenvolvimento:
```bash
yarn dev
```

Para produção:
```bash
yarn build
yarn start
```

## 📋 Scripts disponíveis

- `yarn dev` - Inicia o servidor de desenvolvimento
- `yarn build` - Gera build de produção
- `yarn start` - Inicia o servidor de produção
- `yarn lint` - Executa o linter
- `yarn db:push` - Aplica mudanças do schema no banco
- `yarn db:generate` - Gera o cliente Prisma
- `yarn db:migrate` - Executa migrações do banco
- `yarn db:studio` - Abre o Prisma Studio

## 🛠️ Tecnologias utilizadas

- **Next.js 14** - Framework React
- **TypeScript** - Linguagem de programação
- **Prisma** - ORM para banco de dados
- **PostgreSQL** - Banco de dados
- **Tailwind CSS** - Framework CSS
- **AWS S3** - Armazenamento em nuvem (opcional)
- **Winston** - Sistema de logs

## 📁 Estrutura do projeto

```
web_app/
├── src/
│   ├── app/          # App Router do Next.js
│   ├── components/   # Componentes React
│   └── lib/          # Utilitários e configurações
├── prisma/
│   └── schema.prisma # Schema do banco de dados
├── public/           # Arquivos estáticos
└── uploads/          # Armazenamento local (se configurado)
```

## ⚙️ Configuração de armazenamento

### Armazenamento Local
```env
STORAGE_TYPE="local"
LOCAL_STORAGE_PATH="./uploads"
```

### Armazenamento S3
```env
STORAGE_TYPE="s3"
S3_ENDPOINT="https://s3.amazonaws.com"
S3_ACCESS_KEY_ID="your-access-key-id"
S3_SECRET_ACCESS_KEY="your-secret-access-key"
S3_BUCKET_NAME="your-bucket-name"
```

## 🔧 Requisitos

- Node.js 18+
- PostgreSQL
- Yarn