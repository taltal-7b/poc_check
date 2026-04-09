FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npx prisma generate

RUN mkdir -p /app/uploads
EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node --import tsx src/index.ts"]
