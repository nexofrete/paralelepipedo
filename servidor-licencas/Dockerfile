FROM node:22-alpine
WORKDIR /app
COPY package.json servidor.js ./
COPY public ./public
ENV NODE_ENV=production DADOS_DIR=/dados CONFIAR_PROXY=1
RUN mkdir -p /dados && chown node:node /dados
VOLUME ["/dados"]
USER node
EXPOSE 8080
CMD ["node", "servidor.js"]
