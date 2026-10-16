# Submissions Hub

One database and one admin login for every form:
**2W Ride Along**, **4W Ride Along** and **RoadShield** enquiries.

Each project keeps sending to its Google Sheet and email exactly as before. The hub is an
**extra** destination, and the real record: a header someone edits in a Sheet can't
break it, and no single service going down loses an entry.

```
2W form ──┐
4W form ──┼──►  POST /api/ingest/{project}  ──►  Postgres (Neon)
RoadShield┘                                          │
                         /admin pages  ◄─────────────┘   (one login, read-only, Excel export)
```

## Tech stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript, Tailwind v4 |
| Database | Postgres via `pg`: Neon on Vercel, any Postgres locally |
| Auth | One admin account: scrypt-hashed password, signed httpOnly session cookie |
| Export | `.xlsx` via exceljs |
| Hosting | Vercel |

## Local development

```bash
createdb submissions_hub_dev        # any local Postgres
cp .env.example .env.local          # then fill it in (below)
npm install
npm run dev                         # http://localhost:3400
```

The tables are created automatically on first request.

## Setting it up on Vercel

1. Import the repo into Vercel.
2. **Storage → Create → Neon (Postgres)** and connect it to the project. This sets `DATABASE_URL`.
3. Generate secrets locally and add them as Environment Variables:
   ```bash
   npm run secrets          # SESSION_SECRET, INGEST_KEY_2W, INGEST_KEY_4W, INGEST_KEY_ROADSHIELD
   npm run hash-password    # ADMIN_PASSWORD_HASH (password typed hidden)
   ```
   Also set `ADMIN_USERNAME`.
4. Redeploy, then open `https://<hub-domain>/api/health`. It should show
   `{"database":true,"adminLogin":true}`.
5. In each project's Vercel settings, add:

   | Project | `HUB_INGEST_URL` | `HUB_INGEST_KEY` |
   |---|---|---|
   | 2W | `https://<hub-domain>/api/ingest/2w` | hub's `INGEST_KEY_2W` |
   | 4W | `https://<hub-domain>/api/ingest/4w` | hub's `INGEST_KEY_4W` |
   | RoadShield | `https://<hub-domain>/api/ingest/roadshield` | hub's `INGEST_KEY_ROADSHIELD` |

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (set by the Neon integration) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` | The one admin login |
| `SESSION_SECRET` | Signs session cookies. Changing it signs everyone out. |
| `INGEST_KEY_2W`, `INGEST_KEY_4W`, `INGEST_KEY_ROADSHIELD` | Each project's secret; a key only writes to its own project |
| `STORAGE_LIMIT_MB` | Optional: your plan's storage limit in MB for the Overview meter (default 1024) |
| `INGEST_ORIGINS_2W` | Optional: lets a browser post directly from these site addresses (not needed now that 2W has its own server route) |

## How ingest works

`POST /api/ingest/{2w|4w|roadshield}` with header `x-hub-key` and either
`{ "headers": [...], "values": [...] }` or `{ "fields": { "<header>": "<value>" } }`,
plus optional `submittedAt` (ISO time) and `flagged` (header names to highlight).

- Identical resubmissions are stored once (fingerprint of headers + values).
- Columns are never fixed. A form can add or reword questions, and the Excel export lines
  everything up by header name.
- Browser posts (only if `INGEST_ORIGINS_*` is set) are rate-limited per IP.

## Admin

- **Overview:** totals, last 30 days and flagged counts per form, plus the latest entries.
- **Per form:** search across every answer, a date range (India time), and pages of 50.
- **Detail:** every field, remarks under their question, flagged answers in red.
- **Export to Excel:** the current filter, or a single submission.
- **Delete (permanent):** tick rows and press **Delete**, or use the Delete button on a submission.
  Tick the header box to select the whole page; when more entries match, **Select all N** extends
  the choice across every page of the current search/date filter. Everything asks for confirmation,
  and deleting all matches makes you type `DELETE`. There is no undo, so export to Excel first if
  you might need the data. Deletes re-check the login on the server.
- **Loading feedback:** a progress bar runs along the top the moment you click anything, the sidebar item you
  clicked shows a spinner, every page has a skeleton screen, searching and paging dim the table, and Apply, Export and
  Sign out show their own spinners. (`app/**/loading.tsx`, `components/NavProgress.tsx`, `lib/nav-state.ts`)
- **Storage meter** (Overview): database size against `STORAGE_LIMIT_MB` (default 1024), so you know when to clear old entries.

Login: 8 failed attempts from one IP lock it out for 15 minutes.

## Adding a project

Add an entry to `lib/projects.ts` and an `INGEST_KEY_*` variable, then send to
`/api/ingest/<id>` from that project's server.
