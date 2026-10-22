# syntax=docker/dockerfile:1
FROM node:22-alpine AS base

WORKDIR /app

# Copy root workspace manifests
COPY package*.json ./
COPY sdk/package*.json ./sdk/
COPY packages/proof-server/package*.json ./packages/proof-server/

# Install dependencies
RUN npm install --workspace=@zksoroban/proof-server --workspace=@zksoroban/sdk

# Copy source trees
COPY sdk ./sdk
COPY packages/proof-server ./packages/proof-server
COPY circuits ./circuits

WORKDIR /app/packages/proof-server

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
