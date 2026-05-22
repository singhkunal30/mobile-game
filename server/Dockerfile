FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared ./shared
COPY server ./server
RUN cd shared && npm install && npm run build
RUN cd server && npm install && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/package.json
RUN cd shared && npm install --omit=dev --ignore-scripts
RUN cd server && npm install --omit=dev --ignore-scripts
EXPOSE 2567
CMD ["node", "server/dist/index.js"]
