#-------------------
# build
#-------------------
FROM node:20 as builder

WORKDIR /usr/local/app

COPY package.json package.json
COPY package-lock.json package-lock.json

RUN npm i

COPY . .

RUN npm run build:node

#-------------------
# runtime
#-------------------
FROM node:20-slim
COPY --from=builder /usr/local/app/package.json ./package.json
COPY --from=builder /usr/local/app/dist/index.cjs ./dist/index.cjs

EXPOSE 25
EXPOSE 587
EXPOSE 465

CMD ["npm", "start"]
