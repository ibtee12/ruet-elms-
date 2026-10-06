# RUET ELMS

**RUET ELMS** is a Learning Management System built for Rajshahi University of Engineering & Technology (RUET).

## Tech Stack (Step 1)
- **Framework**: Next.js 15 (App Router, Strict TypeScript)
- **Database & ORM**: PostgreSQL + Prisma ORM
- **Validation**: Zod (environment and input validation)
- **Testing**: Vitest
- **Icons**: Lucide React
- **Styling & Tooling**: Tailwind CSS, ESLint, Prettier

---

## Getting Started

### Prerequisites
- Node.js (v20+ or v22+)
- PostgreSQL database instance
- npm (or compatible package manager)

### 1. Environment Setup
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string.
- `NEXTAUTH_SECRET`: Secret key for session encryption.
- `NEXTAUTH_URL`: Canonical application URL (e.g. `http://localhost:3000`).
- `SUPABASE_URL`: Supabase project URL for private storage.
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for server-side storage access.
- `SUPABASE_BUCKET`: Target storage bucket name.
- `RESEND_API_KEY`: API key for transactional emails via Resend.
- `EMAIL_FROM`: Sender email address (e.g. `RUET ELMS <noreply@ruet.ac.bd>`).
- `CRON_SECRET`: Bearer token for authenticating automated cron triggers.
- `APP_TIMEZONE`: Timezone for display (`Asia/Dhaka`).

Missing environment variables will prevent server startup with a formatted error message.

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Migration & Seeding
```bash
# Run Prisma migrations
npm run db:migrate

# Run database seed
npm run db:seed
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Health Check
Verify system status at:
```bash
curl http://localhost:3000/api/health
# Response: {"status":"ok"}
```

### 6. Linting and Testing
```bash
# Run ESLint
npm run lint

# Run Vitest test suite
npm test
```

---

## Automated Reminders Scheduler (Step 31)

RUET ELMS dispatches deadline reminders for assignments and quizzes via `POST /api/cron/reminders`.
The endpoint is protected by a constant-time check against the `CRON_SECRET` environment variable.

### Option A: Vercel Cron (Configured)
Configured in `vercel.json` to trigger every 15 minutes:
```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "*/15 * * * *"
    }
  ]
}
```
In your Vercel Project Settings > Environment Variables, define `CRON_SECRET`. Vercel automatically passes `Authorization: Bearer <CRON_SECRET>` with scheduled requests.

### Option B: Supabase / pg_cron or External Runner
To invoke via pg_cron, Supabase Edge Functions, or an external cron runner:
```bash
curl -X POST https://elms.ruet.ac.bd/api/cron/reminders \
  -H "Authorization: Bearer $CRON_SECRET"
```
Or via SQL `pg_net` in Supabase:
```sql
SELECT net.http_post(
  url := 'https://elms.ruet.ac.bd/api/cron/reminders',
  headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true))
);
```

