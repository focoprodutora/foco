FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public
COPY faq.md ./

# O banco de dados fica aqui: monte um volume nesta pasta para não perder os dados.
VOLUME /app/dados

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||process.env.PORTA||3000)+'/saude').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["npm", "start"]
