# Railway builds and runs the app from this file. Cloudflare deploys (npm run cf:deploy) don't use it.
FROM node:24-slim

# Chromium prints the PDF report on the server (src/lib/pdf.ts). The fonts are its fallbacks.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_PATH=/usr/bin/chromium \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# NEXT_PUBLIC_* values are compiled into the browser code, so they must exist at build time.
# Railway passes a service variable to the build only when it's declared here.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
RUN npm run build

ENV NODE_ENV=production
# Railway sets PORT; next start listens on it.
CMD ["npm", "start"]
