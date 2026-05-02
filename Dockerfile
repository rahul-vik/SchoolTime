FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# prepare runs before full COPY; keep this file available for npm ci
COPY scripts/husky-prepare.mjs ./scripts/husky-prepare.mjs
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY scripts/husky-prepare.mjs ./scripts/husky-prepare.mjs
RUN npm ci --omit=dev
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist
COPY index.html ./index.html
COPY vite.config.js ./vite.config.js
EXPOSE 8787
CMD ["node", "server/index.js"]
