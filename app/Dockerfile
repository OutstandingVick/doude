# Feasibility3D app (Next.js).
#
# Build from the app/ directory (the compose file sets the context to ./app):
#   docker build -t feasibility3d-app .
#
# NEXT_PUBLIC_FEASIBILITY3D_API is inlined at build time, so pass it as a build
# arg. It must be the engine URL that the BROWSER can reach (not the internal
# container hostname) — e.g. http://localhost:8000 for local compose, or
# https://your-domain/api behind a reverse proxy in production.

# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_FEASIBILITY3D_API=http://localhost:8000
ENV NEXT_PUBLIC_FEASIBILITY3D_API=$NEXT_PUBLIC_FEASIBILITY3D_API
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# `next start` runs a single Node process; the app is stateless (all data
# lives in the engine), so this is safe to scale if needed.
CMD ["npm", "run", "start"]
