FROM node:20-alpine

WORKDIR /app

# Instala dependências primeiro (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copia o código
COPY src/ ./src/
COPY db/  ./db/

EXPOSE 4000

CMD ["node", "src/index.js"]
