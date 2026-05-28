FROM node:20-alpine AS builder
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3000
CMD ["npm","start"]
