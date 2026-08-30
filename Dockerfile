FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de paquetes
COPY backend/package*.json ./backend/
RUN cd backend && npm install

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# Copiar código fuente
COPY backend ./backend
COPY frontend ./frontend

# Compilar
RUN cd frontend && npm run build
RUN cd backend && npm run build

# Imagen de producción final
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 3000
ENV PORT=3000

CMD ["node", "backend/dist/main.js"]
