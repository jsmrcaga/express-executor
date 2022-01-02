FROM node:16-alpine3.12

RUN mkdir /code
WORKDIR /code

COPY package*.json ./
RUN npm install

EXPOSE 1234
