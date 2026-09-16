FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/

RUN cd backend && npm ci --omit=dev

COPY backend/server.js ./backend/
COPY backend/parser.js ./backend/
COPY backend/dbService.js ./backend/

COPY frontend ./frontend

RUN mkdir -p /app/backend/resumes
RUN mkdir -p /app/backend/uploads_tmp

EXPOSE 3000

CMD ["node", "backend/server.js"]