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

## People, access and roles

Everyone signs in with a username and password. Two kinds of account:

- **Owner**: the `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` login from the Vercel settings. Always an admin, can't be
  disabled or edited from the app, so a mistake in the People page can never lock everyone out.
- **People**: added by an admin on **People & access**. Nothing to configure; the tables create themselves.

Access is set per person, per portal (2W, 4W, RoadShield):

| Level | Can |
|---|---|
| **Viewer** | open, search and export records |
| **Contributor** | + add notes and highlight records |
| **Manager** | + delete records |
| *no access* | the portal doesn't appear, and its addresses answer "not found" |

An **admin** is a Manager on every portal and also manages people and sees the **Activity log** (deletes and user changes).

How it behaves:

- A new person gets a generated password, shown **once** to the admin to pass on. They must choose their own at first sign-in.
  Admins can reset a password, disable a person (their notes stay) or delete them.
- Changes apply immediately: removing access, disabling, or resetting a password ends the person's open sessions on their next click.
- Every check runs on the server (pages, Excel export and every action), not just in the buttons, and portal/admin pages
  are checked in layouts above the loading skeleton so the response is a real 404.
- The owner password is changed in Vercel; everyone else changes theirs on **Account**.
- Deploying this version signs everyone out once (the session cookie changed). Sign in again.

### Highlights and notes

The replacement for colouring rows in Excel. **Contributors and above** can:

- **Highlight** a record in one of five colours (Needs action, Follow up, Done / OK, For info, Escalated): from the record page, or tick
  rows (or "Select all N" across pages) and pick a colour. The row is tinted in the list, and the Excel export keeps the row colour.
- Add **notes** to a record (newest first, with author and time; authors and Managers can delete). Notes are searchable and the export includes them.
- Filter the list by highlight colour and by "With notes".

Colours and meanings live in `lib/marks.ts`; levels in `lib/permissions.ts`; portals in `lib/projects.ts`.

## Admin

- **Overview:** totals, last 30 days and flagged counts per form, plus the latest entries.
- **Per form:** search across every answer, a date range (India time), and pages of 50.
- **Your own columns:** the table starts with a few key columns, but each form collects dozens. **Columns** opens a side panel
  listing every field: search it, add with a click, drag to reorder, or press **Add N flagged columns** to pull in just the
  questions someone got wrong on the page you're viewing. Your layout (columns, order and widths) is saved on the server per
  person and per portal, so it follows you to any device; **Default** puts it back.
- **Spreadsheet feel:** the grid scrolls sideways and down with the checkbox and Received columns and the heading row frozen,
  edge shadows when there's more to see, drag a column edge to resize (double-click to reset), click a heading to sort
  (numbers sort as numbers; click again to reverse, a third time to clear; it sorts across every page). Flagged answers show
  in red inside the grid, and the flag and note counts sit in the frozen Received column. Click anywhere on a row to open it.
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
