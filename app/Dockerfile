# Feasibility3D app (Next.js).
#
# Build from the app/ directory (the compose file sets the context to ./app):
#   docker build -t feasibility3d-app .
#
# The browser calls /api/* on the app's origin; Next proxies to ENGINE_URL
# (server-side). Rewrites are resolved at build time, so pass ENGINE_URL as a
# build arg — e.g. http://engine:8000 inside docker compose.

# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG ENGINE_URL=http://engine:8000
ENV ENGINE_URL=$ENGINE_URL
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# `next start` runs a single Node process; the app is stateless (all data
# lives in the engine), so this is safe to scale if needed.
CMD ["npm", "run", "start"]
