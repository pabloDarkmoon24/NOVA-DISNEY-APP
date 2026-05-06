FROM node:20-alpine

WORKDIR /app

# Instalar dependencias del backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Instalar dependencias del frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# Copiar código fuente
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Compilar el frontend (genera frontend/dist/)
RUN cd frontend && npm run build

EXPOSE 5000

CMD ["node", "backend/server.js"]
