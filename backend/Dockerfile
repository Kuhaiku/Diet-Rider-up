# Usa uma imagem leve do Node
FROM node:18-alpine

# Cria a pasta de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependência primeiro (para cache)
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia o restante do código
COPY . .

# Expõe a porta 3000
EXPOSE 3000

# Comando para iniciar
CMD ["node", "server.js"]