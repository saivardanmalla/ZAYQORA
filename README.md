# ZAYQORA by VIRELEO — Complete Digital Restaurant Platform

## Google AI Studio Build Mode Runtime Note

Google AI Studio Build Mode executes inside a **Node.js 22 + Vite + React + Express** sandbox on port `3000` and does not run Python/Uvicorn, Celery, PostgreSQL, Redis, or a separate Next.js server process natively in-container.

To deliver a **100% live, persistent, real-time full-stack platform** inside Build Mode *without* silently abandoning the preferred production stack:

1. **Live Interactive Runtime (Root Workspace)**:
   - **Frontend**: React 19 + TypeScript + Tailwind CSS v4 (Light & Dark modes) + Recharts + Lucide Icons.
   - **Design System**: VIRELEO Brand Palette (`#101D35` Primary Navy, `#0B1426` Deep Navy, `#0D9488` Teal, `#E9B44C` Gold Accent) with `Plus Jakarta Sans`, `Inter`, `Cormorant Garamond`, and `JetBrains Mono` tabular figures.
   - **Backend**: Express + TypeScript + `ws` tenant-scoped WebSockets + JWT RBAC (9 roles) + Zod validation + HMAC-SHA256 sandbox payment verification + `express-rate-limit`.
   - **Database**: Persistent relational SQLite (`better-sqlite3` in WAL mode with foreign keys, additive schema migrations, and transaction-safe reservation locking).

2. **Exportable Production Stack Scaffold (`/export-scaffold/`)**:
   - **Frontend (Vercel)**: Next.js App Router scaffold (`export-scaffold/frontend/package.json` with shadcn/ui-ready dependencies, TanStack Query, React Hook Form, Zod, Motion, Recharts, and `vercel.json`).
   - **Backend (Render)**: Python FastAPI + WebSocket + SQLAlchemy 2.0 UUID multi-tenant models + Alembic migrations + `render.yaml` (`export-scaffold/backend/`).
   - **Background Jobs (Celery + Redis)**: `export-scaffold/backend/app/celery_worker.py` configured for async transactional email receipts, signed webhook retries, and nightly analytics rollups.
   - **Object Storage (S3 / R2 / MinIO)**: `export-scaffold/backend/app/storage.py` providing tenant-isolated presigned upload URLs for logos, cover banners, and dish photography.
   - **CI/CD & Containers**: `export-scaffold/.github/workflows/ci.yml` and `export-scaffold/docker-compose.yml` running PostgreSQL 16 + Redis 7 + FastAPI + Celery Worker + Next.js.

## Local Development (Live Preview)

```bash
npm install
npm run dev
```

## Production Stack Deployment (Docker Compose / Render + Vercel)

### 1. Local Containerized Production Stack
```bash
cd export-scaffold
docker compose up --build
```
Starts PostgreSQL (`5432`), Redis (`6379`), FastAPI (`8000`, runs `alembic upgrade head` automatically), Celery Worker, and Next.js (`3000`).

### 2. Deploy Backend to Render
- Point Render to `export-scaffold/backend` using `render.yaml`.
- Provision PostgreSQL and Redis instances and set `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`.
- Run migrations: `alembic upgrade head`.
- Start worker service: `celery -A app.celery_worker.celery_app worker --loglevel=info`.

### 3. Deploy Frontend to Vercel
- Connect `export-scaffold/frontend` to Vercel (`vercel.json` included) with `NEXT_PUBLIC_API_URL` pointing to your Render FastAPI URL.
