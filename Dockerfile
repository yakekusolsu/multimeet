FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package*.json shared/
COPY server/package*.json server/
COPY web/package*.json web/
COPY extension/package*.json extension/
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/server/package*.json server/
COPY --from=build /app/shared/package*.json shared/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/web/dist web/dist
COPY --from=build /app/node_modules node_modules
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
