# BRAHMO Document Intelligence

React + Vite frontend with an Express backend and MySQL support.

## Project structure

- `src/` — React application source
- `server/` — Express backend API
- `vite.config.ts` — Vite config with API proxy to Express
- `package.json` — project scripts and dependencies

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the project root to configure frontend/backend base URLs, MySQL settings, and the OpenAI API key. Example values are stored in `.env.example`:
   ```env
   VITE_API_BASE_URL=http://localhost:4000/api
   BACKEND_BASE_URL=http://localhost:4000
   PORT=4000
   MYSQL_HOST=localhost
   MYSQL_USER=root
   MYSQL_PASSWORD=
   MYSQL_DATABASE=brahmo_doc_intelligence
   OPENAI_API_KEY=your_openai_api_key_here
   ```
   If `OPENAI_API_KEY` is not present, the app still runs with the built-in rule-based scoring only.
   The frontend reads `VITE_API_BASE_URL`, and the backend reads `PORT`, `MYSQL_*`, and `OPENAI_API_KEY`.
   The backend now auto-creates the MySQL database, imports `db/schema.sql`, and seeds `db/seed.sql` if needed.


3. Start development servers:
   ```bash
   npm run dev
   ```

4. Open the frontend at `http://localhost:5173`.

## Backend endpoints

- `GET /api/health` — health check
- `GET /api/knowledge-nodes` — sample MySQL-backed knowledge node endpoint

## Notes

- The backend uses `mysql2` to connect to a MySQL database.
- If no database is configured, the frontend still runs correctly.
- This scaffold is ready for legal document upload, chunking, comparison, and risk scoring features.
