# Submissions Hub

One database and one admin for every form the team runs: **2W Ride Along**, **4W Ride Along** and
**RoadShield** enquiries. Every submission lands here, and people with the right access can search, sort,
highlight, annotate, export and (if allowed) delete them. It replaces working out of Google Sheets.

> **If you are a new developer or an AI agent picking this up, read this file top to bottom first.** It records
> what exists, *how it was set up* (database, hosting, keys, how the other projects connect), why it was built
> this way, and the gotchas that cost time. Section 12 is a symptom → cause → fix table.

## Contents

1. [At a glance](#1-at-a-glance)
2. [Architecture](#2-architecture)
3. [How it was set up (the database and hosting story)](#3-how-it-was-set-up)
4. [Connecting the other projects](#4-connecting-the-other-projects)
5. [Environment variables](#5-environment-variables)
6. [The database](#6-the-database)
7. [The ingest API](#7-the-ingest-api)
8. [People, access and security](#8-people-access-and-security)
9. [What the admin does](#9-what-the-admin-does)
10. [Code map](#10-code-map)
11. [Runbook: everyday jobs](#11-runbook-everyday-jobs)
12. [Troubleshooting](#12-troubleshooting)
13. [Developing and testing](#13-developing-and-testing)
14. [Decisions, gotchas and known limits](#14-decisions-gotchas-and-known-limits)
15. [Related projects and history](#15-related-projects-and-history)
16. [Website photos (RoadShield)](#16-website-photos-roadshield)

---

## 1. At a glance

| | |
|---|---|
| Live admin | https://submissions-hub.vercel.app |
| Repo | https://github.com/akhilkashetty1/submissionsHub (private), `main` auto-deploys on Vercel |
| Stack | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Postgres via `pg` · exceljs |
| Database | **Neon Postgres**, added through Vercel (Storage / Marketplace) on the free plan |
| Hosting | Vercel (project name `submissions-hub`) |
| Sends data here | `rideAlong2w` (2W), `rideAlong4w` (4W), `roadshield1` (RoadShield): each posts server-to-server |
| Local dev | `npm run dev` on port **3400**, against any local Postgres |
| Health check | `GET /api/health` → `{"database":true,"adminLogin":true}` when everything is configured |

The three source projects keep working exactly as before (Google Sheet + Brevo email). **The hub is an
additional destination**, and it is the one that does not break when someone edits a spreadsheet heading.

## 2. Architecture

```
                    server → server, header x-hub-key (one secret per project)
 2W  (rideAlong2w)  ──┐
 4W  (rideAlong4w)  ──┼──►  POST /api/ingest/{2w|4w|roadshield}  ──►  Postgres (Neon)
 RoadShield (roadshield1) ┘                                              ▲
                                                                          │ queries (lib/*.ts)
                          Admin app: sign-in · portals · records · people ┘
                          Excel export · notes · highlights · activity log
```

- **Each submission is stored whole**, as the form's own ordered column headings plus their values (`headers`
  and `values` JSON arrays). There is no fixed column list, so a form can add or reword questions without
  touching the hub, and nobody can "break the format" by editing a header.
- **The other projects send to every place they're configured, in parallel**, and count an entry as saved if
  *any* channel accepted it (Sheet, hub, email). One outage doesn't lose data. See each project's
  `app/api/.../route` file.
- **The admin app reads the database directly** in server components. There's no separate API for the UI.
- **Everything is dynamic** (`force-dynamic` layouts, cookies read per request). There's no static caching of
  data pages.

## 3. How it was set up

This is the order things were actually done, so it can be repeated (new environment, disaster recovery) or
explained. Nothing here needs a terminal on the server: it is Vercel + Neon + a few environment variables.

### 3.1 Why a hub at all
The earlier setup was a Create React App on GitHub Pages plus an Express server on Render, writing rows to a
Google Sheet via an Apps Script. Two things went wrong in practice: the Render server lapsed and entries were
lost, and someone edited a sheet heading and rows stopped lining up. The Sheet *was* the database. The hub
moves the real record into Postgres, while the Sheets and Brevo email keep working as parallel backups.

### 3.2 Why Neon (Postgres) on Vercel
Volume is tiny (about 100 entries a month per form, far fewer for RoadShield), so any free tier is big enough.
What matters is that it never switches off or refuses a write. Neon's compute **sleeps when idle but wakes on
the next request** (first request after quiet is a little slower; nothing is lost). Supabase's free tier
*pauses a project after about a week of inactivity* (at the time of writing; check current terms), which RoadShield would hit
regularly, so it was ruled out.
Plain `pg` is used (no ORM) so the same code runs on a local Postgres and on Neon.

### 3.3 Steps that were taken
1. **Created the GitHub repo** (`akhilkashetty1/submissionsHub`, private, empty) and pushed this code to `main`.
2. **Vercel → Add New → Project → import the repo.** Defaults as detected (Next.js). The first deploy builds
   fine but the app can't work until steps 3–4 (health shows `database:false`), which is expected.
3. **Added the database from Vercel.** In the new project: *Storage / Marketplace → Neon → Create*:
   - **Plan:** Free. **Region:** the one nearest India (Singapore, or Mumbai if offered). This was the recommendation; check
     the Neon console for the region actually in use.
   - **Environments:** connect to **Production, Preview and Development**.
   - **Custom Prefix:** left **empty**: the code reads exactly `DATABASE_URL`, and a prefix would rename it.
   - **Database branches for deployments:** left **off**. It would give every preview deployment its own copy of
     the database, which only creates empty previews and eats the free plan's limits. One database is right.
   - The integration may also add `POSTGRES_*` / `PG*` variables. They're harmless; the app uses `DATABASE_URL`
     (and falls back to `POSTGRES_URL`).
   - Recommended: *Settings → Functions → Function Region* → Mumbai (`bom1`) so the app runs near the database.
4. **Generated secrets on a personal machine** (never in a chat or a commit). From this repo:
   ```bash
   npm run secrets         # prints SESSION_SECRET and one INGEST_KEY_* per project (random 32 bytes each)
   npm run hash-password   # asks for the admin password (hidden), prints ADMIN_PASSWORD_HASH=scrypt.…
   ```
   Run `npm run secrets` **once** and save the output in a password manager: running it again makes brand-new
   values, and the project keys must match the hub's.
5. **Added six environment variables** in Vercel → Settings → Environment Variables (all environments):
   `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `INGEST_KEY_2W`, `INGEST_KEY_4W`,
   `INGEST_KEY_ROADSHIELD`. (`DATABASE_URL` came from step 3.)
6. **Redeployed** (variables only apply to builds made *after* they're added) and opened `/api/health`:
   `{"database":true,"adminLogin":true}`. Then signed in as the owner.
7. **Connected the three projects** (section 4), redeployed each, and sent a test entry through each one. All
   three arrive in the hub. (Delete any leftover test entries from the admin: tick them → Delete.)

The tables are created by the app itself on first use; there's no SQL to run by hand (section 6).

### 3.4 Local development setup
```bash
createdb submissions_hub_dev                 # any local Postgres works
cp .env.example .env.local                   # fill in, see section 5
npm install
npm run dev                                  # http://localhost:3400
```
For `.env.local`: `DATABASE_URL=postgres://localhost/submissions_hub_dev`, plus `npm run secrets` output and a
hash from `npm run hash-password`. **`.env.local` is git-ignored: never commit it.**

## 4. Connecting the other projects

Each project's server posts to the hub with its own secret. A key can only write to **its own** project.

| Project (repo) | `HUB_INGEST_URL` | `HUB_INGEST_KEY` (value of the hub's…) | Sends |
|---|---|---|---|
| 2W (`rideAlong2w`, site `ride-along-form.in`) | `https://submissions-hub.vercel.app/api/ingest/2w` | `INGEST_KEY_2W` | `{ fields: {…}, flagged, submittedAt }` (the form's flat answers; `flagged` lists the headings of answers that need follow-up, so 2W records show red flags like 4W's; older 2W records have none) |
| 4W (`rideAlong4w`) | `https://submissions-hub.vercel.app/api/ingest/4w` | `INGEST_KEY_4W` | `{ headers, values, submittedAt, flagged }` |
| RoadShield (`roadshield1`, `www.road-shield.in`) | `https://submissions-hub.vercel.app/api/ingest/roadshield` | `INGEST_KEY_ROADSHIELD` | `{ headers, values }` |

Set both as Environment Variables in **that project's** Vercel settings, then **redeploy** it. If they're unset
the project still works (Sheet/email only); it just doesn't send to the hub.

Where the sending code lives:
- 2W: `app/api/submit-to-sheets/route.js` (replaced the old Express server on Render).
- 4W: `app/api/submit/route.ts` (validates server-side, then Sheet + Brevo + hub in parallel).
- RoadShield: `app/api/contact/route.ts` (Brevo + Sheet + hub).

**Rotating a project's key:** generate a new random value, update `INGEST_KEY_*` in the hub's Vercel settings
*and* `HUB_INGEST_KEY` in that project's, redeploy both. Entries sent between the two redeploys get a 401 from the
hub (the project logs it, and still saves to its other channels).

## 5. Environment variables

**On the hub** (Vercel → `submissions-hub` → Settings → Environment Variables):

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (set by the Neon integration; falls back to `POSTGRES_URL`) |
| `ADMIN_USERNAME` | yes | Username of the **owner** account (the one that can never be locked out) |
| `ADMIN_PASSWORD_HASH` | yes | Owner password as `scrypt.<salt>.<hash>`, from `npm run hash-password` (never the plain password) |
| `SESSION_SECRET` | yes | ≥ 32 random chars; signs the session cookie. **Changing it signs everyone out.** |
| `INGEST_KEY_2W` / `INGEST_KEY_4W` / `INGEST_KEY_ROADSHIELD` | yes | One secret per project (≥ 24 chars) |
| `STORAGE_LIMIT_MB` | no | Plan storage limit for the Overview meter (default 1024) |
| `SITE_URL_ROADSHIELD` | for website photos | The RoadShield site's address, e.g. `https://road-shield.in` (no trailing slash). Section 16 |
| `SITE_SECRET_ROADSHIELD` | for website photos | ≥ 16 random chars, the same value as RoadShield's `SITE_REVALIDATE_SECRET` |
| `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` | for uploads | Set automatically when a **public** Vercel Blob store is connected to the hub project (older stores set the token, newer ones set `BLOB_STORE_ID` and authenticate with the project's OIDC token; both work). Without one, uploads fail on Vercel (locally they go to `.local-uploads/`) |
| `INGEST_ORIGINS_2W` | no | Allows browsers on those site addresses to post to the 2W endpoint with **no key**, rate-limited. Not needed: 2W now posts from its own server. Leave empty. |

**On each sending project:** `HUB_INGEST_URL`, `HUB_INGEST_KEY` (section 4). They also keep their own
`GOOGLE_SHEET_WEBAPP_URL` and Brevo variables.

`/api/health` reports `adminLogin:true` only when `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` and a ≥ 32-char
`SESSION_SECRET` are all set. `.env.example` lists everything with comments.

## 6. The database

Postgres. **The schema creates and upgrades itself**: the first query after a cold start runs `migrate()` in
`lib/db.ts`, which is idempotent (`create table if not exists`, `add column if not exists`, `create index if not
exists`). It first runs a cheap check and does nothing if everything already exists; otherwise it applies the
schema inside a transaction guarded by `pg_advisory_xact_lock(727001)`, so two servers starting together can't
collide (this works through Neon's connection pooler).

| Table | What it holds |
|---|---|
| `submissions` | One row per entry: `project`, `received_at`, `submitted_at` (when completed on a device, if sent later), `title`, `headers` + `values` (JSON arrays), `flagged` (JSON array of headings), `search` (lowercased text for searching), `fingerprint`, `mark` / `mark_by` / `mark_at` (highlight). Unique on `(project, fingerprint)` so identical resends are stored once. |
| `submission_notes` | Notes on a record: `submission_id` (**cascades on delete**), author id and **author name copied in** (so deleting a user keeps the name), `body`, `created_at`. |
| `users` | People: `username` (unique, case-insensitive), `display_name`, `password_hash`, `is_admin`, `active`, `must_change_password`, `session_version`, timestamps. The owner is **not** in this table. |
| `user_access` | `(user_id, project, level)` with level `read` / `write` / `manage`. |
| `user_views` | Each person's saved table columns and widths per portal (`user_id` 0 = owner). |
| `cell_marks` | Colour on a single value: `(submission_id, col)` primary key (**cascades on delete**), `mark`, `mark_by`, `mark_at`. `col` must be one of the record's own headings. |
| `activity_log` | Audit trail: deletes, user changes, website publishes. |
| `site_media` | Website photos uploaded here: `site`, Blob `url` + `storage_key`, `w`/`h`/`bytes`, uploader. The files live in Vercel Blob, never in the database. |
| `site_slots` | One row per photo spot (`site`, `slot`): `draft` and `published` (jsonb `{layout?, items:[{src, alt, w, h, label, position, media?}]}`). `published` null = the site shows its built-in photos. |
| `site_manifests` | The last list of photo spots each site reported (so the editor opens if the site is briefly down). |
| `ingest_log`, `login_failures` | Rate-limit bookkeeping (kept small; old rows are pruned). |

**When you add a table or column:** add the idempotent statement to `SCHEMA` in `lib/db.ts` **and** extend the
"already migrated?" check at the top of `migrate()` (otherwise an existing database that passes the old check
will never receive the change).

**Connection handling:** one `pg` Pool, `max: 3`, reused across warm invocations and hot reloads
(`globalThis.__hubPool`). Neon's compute can be asleep, and the first query may take a moment.

**Size:** a record is the full set of answers (4W has ~72 columns), plus a copy as search text, so budget on the
order of **10–20 KB per record**. At about 1,000–1,500 entries a year that is nowhere near the free plan's
storage. The Overview shows a storage meter for admins. Check Neon's current plan limits and its restore
history options in the Neon console, since those change; **Excel export is the manual backup.**

**Deleting data** is permanent (no soft delete). Notes go with their record.

## 7. The ingest API

`POST /api/ingest/{2w|4w|roadshield}` with `Content-Type: application/json` and header `x-hub-key: <that project's key>`.

Body is **either**:
```json
{ "headers": ["Name", "HQ", "Vehicle 3. Are the headlights…?"], "values": ["Asha", "Hyd", "No"],
  "submittedAt": "2026-10-16T09:12:00Z", "flagged": ["Vehicle 3. Are the headlights…?"] }
```
**or** a flat object (what 2W sends): `{ "fields": { "Name": "Asha", "HQ": "Hyd" } }`.

- `submittedAt` (optional): when the form was completed (matters for entries held offline and sent later;
  accepted if within 5 minutes in the future or 60 days in the past, else `received_at` is used).
- `flagged` (optional): headings to show in red and count as "needs follow-up". Names that aren't headings are dropped.
- Limits: ≤ 300 columns, headings ≤ 300 chars, values ≤ 5,000 chars (truncated), body ≤ 200 KB. Repeated headings
  are made unique (`Name`, `Name (2)`).
- The `title` shown in lists comes from the column named in `titleColumn` in `lib/projects.ts` (currently `Name`).

Responses: `201 {ok:true,id}` stored · `200 {ok:true,duplicate:true}` identical entry already stored · `400` bad
body · `401` wrong/missing key · `404` unknown project · `413` too large · `429` browser rate limit · `500` database problem.

Auth: the key is compared in constant time against `INGEST_KEY_*` and must be ≥ 24 chars. The optional browser path
(`INGEST_ORIGINS_*`) allows CORS only from the listed origins and limits each IP to 30 per hour.

Try it:
```bash
curl -X POST https://submissions-hub.vercel.app/api/ingest/4w \
  -H "x-hub-key: $INGEST_KEY_4W" -H "content-type: application/json" \
  -d '{"headers":["Name","HQ"],"values":["TEST - delete me","Hyd"]}'
```
Then delete the test row in the admin.

## 8. People, access and security

Two kinds of account:
- **Owner**: `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` from the environment. Always an admin. Not stored in the
  database, so it can't be disabled, deleted or locked out by a mistake in the People page. Its password is changed
  by generating a new hash (`npm run hash-password`) and updating the Vercel variable.
- **People**: created by an admin on **People & access**. Passwords are scrypt-hashed.

Access is per person, per portal:

| Level | Can |
|---|---|
| **Viewer** (`read`) | open, search, sort, export |
| **Contributor** (`write`) | + add notes, highlight records |
| **Manager** (`manage`) | + delete records |
| *no access* | portal is absent from the menu and its addresses return **404** |
| **Admin** | Manager on every portal, plus people and the activity log |

How it is enforced (all in code, not just hidden buttons):
- **Sessions:** a signed `httpOnly` cookie (`hub_session`) holding `{id, username, session version, expiry}`.
  Access is looked up fresh on **every request**, so removing access, disabling a person or resetting a
  password takes effect on their next click. Disabling, deleting or resetting a password bumps `session_version`,
  which invalidates their cookies.
- **Pages:** route-group layouts do the checks *above* the loading skeletons so refusals are real HTTP 404s and
  nothing from a forbidden portal is ever queried: `(admin)/(app)/layout.tsx` (signed in + password current),
  `(app)/(admin-only)/layout.tsx` (admins), `(app)/p/[project]/layout.tsx` (access to that portal). Pages also
  re-check (defence in depth).
- **Actions and export:** every server action goes through `lib/access.ts` (`authorise`, `authoriseAdmin`);
  the Excel route checks read access itself. Server actions are public web endpoints; never trust the UI.
- **Rules:** admins can't disable, demote or delete *themselves* or reset their own password from People (they use
  Account); usernames are 3–32 chars `a-z 0-9 . _ -`, can't equal the owner's, are case-insensitive unique;
  passwords ≥ 10 characters; a generated password (`xxxx-xxxx-xxxx`) is shown **once** and the person must set
  their own at first sign-in (every page redirects to Account until they do).
- **Brute force:** 8 failed sign-ins (or wrong current-password attempts) from one IP lock it for 15 minutes.
  Unknown usernames still run a password hash so timing doesn't reveal which exist.
- **Secrets:** never in git. `ADMIN_PASSWORD_HASH` is a hash, not the password.

## 9. What the admin does

- **Overview:** per-portal totals, last 30 days, flagged counts, highlighted counts, latest entries; storage meter (admins).
- **A portal's table** (`/p/{project}`): search every answer **and note text**, date range (India time), filter by
  highlight colour and "With notes", 50 per page.
  - **Your own columns:** a *Columns* side panel lists every field the form has collected. Search, click to add,
    drag/arrows to reorder, "Add N flagged columns" for questions answered wrongly on the page, *Default* to reset.
    Saved per person per portal in `user_views`, so it follows them across devices. Defaults come from `listColumns`
    in `lib/projects.ts`.
  - **Spreadsheet feel:** scrolls sideways and down with the checkbox + Received columns and heading row frozen,
    edge shadows, drag a column edge to resize (double-click resets), click a heading to sort server-side across
    all pages (numbers numerically, dates like "05 Mar 2027" by date, e.g. the 4W documents' valid-till
    columns; asc → desc → clear). Flagged answers are red in the grid; flag and note counts
    and the highlight dot sit in the frozen Received cell; clicking a row opens it.
- **A record** (`/p/{project}/{id}`): all answers (remarks folded under questions), flagged answers in red, a
  highlight picker, notes (newest first; author or a Manager can delete), prev/next.
- **Highlights:** five colours with meanings (`lib/marks.ts`: Needs action, Follow up, Done / OK, For info, Escalated),
  set per record, on ticked rows, or on everything a filter matches. Tinted in the list and kept in Excel.
- **Quick actions in the table (Contributor+):** select text in a cell, right-click a row, or press a row's `⋯`
  (`components/QuickActions.tsx`, wired in `SubmissionsTable.tsx`). A floating pill offers colour (**This value** →
  `cell_marks`, or **Whole row** → `submissions.mark`), Add note (pre-filled with the selected quote and column),
  Copy selection/value, Copy row (tab-separated, pastes into Excel) and Open. Keys 1-5 pick a colour, 0 clears,
  Esc closes. Pressing the colour already set clears it. Viewers never see the pill. Server action:
  `setCellMarkAction` in `app/record-actions.ts`; cell colours also show on the record page and as cell fills in the Excel export.
- **Delete (Manager):** tick rows or "Select all N" across pages; confirm; bulk "all matching" requires typing `DELETE`.
  Logged in the activity log.
- **Export to Excel:** current filters (or one record). Includes **all** columns (not just the ones on screen),
  highlight + who set it, notes, row colours, flagged cells in red.
- **People & access / Activity log** (admins), **Account** (everyone: change own password).
- **Navigation feel:** progress bar on every click, skeleton screens, spinners; the left menu collapses to an
  icon rail (button in the top bar, or `[`). It starts open on every visit; a collapse is remembered until the
  browser is closed, in the `hub_sidebar_session` cookie that the server reads.

## 10. Code map

```
app/
  login/                         sign-in page
  (admin)/layout.tsx             the shell: menu, account, sign out (allows the must-change-password case)
  (admin)/account/               change own password
  (admin)/(app)/layout.tsx       gate: signed in AND password up to date
  (admin)/(app)/(home)/          Overview (own loading skeleton, so it doesn't wrap other routes)
  (admin)/(app)/p/[project]/     layout (access gate) · page (table) · [id]/ (record) · loading skeletons
  (admin)/(app)/(admin-only)/    layout (admins only) · users/ · activity/
  api/ingest/[project]/          how projects send data in (key auth)
  api/export/[project]/          Excel export (session + read access)
  api/health/                    setup check
  (admin)/(app)/site/[site]/     website photo editor (layout = access gate)
  api/site/[site]/               public feed of published photos (read by the site)
  api/site/[site]/upload/        photo upload (Contributor+): re-encoded to WebP with sharp, stored in Blob
  api/site-file/[name]/          serves local uploads in development only
  site-actions.ts                save draft, discard, publish, delete unused photo
  actions.ts                     login, logout, delete records
  record-actions.ts              highlight, notes
  user-actions.ts                create/edit/reset/delete people, change own password
  view-actions.ts                save/reset a person's table layout
components/                      SubmissionsTable (grid), ColumnPicker, NotesPanel, MarkPicker, UsersManager,
                                 FilterBar, ConfirmDialog, Modal, AppShell/SidebarToggle, NavProgress/NavFade, skeletons…
lib/
  db.ts                          Pool, query(), transaction(), SCHEMA + migrate()
  auth.ts                        sessions, getCurrentUser, requireUser/Admin/ProjectAccess
  access.ts                      authorise() for server actions
  permissions.ts                 levels and can()/levelFor()/visibleProjects() (safe for browser and server)
  projects.ts                    the portals (id, name, key env var, default columns): add a project here
  submissions.ts                 all record queries: list/sort/filter, marks, notes, delete, stats
  users.ts · password.ts         people and scrypt/password helpers
  views.ts                       saved columns, available columns
  marks.ts · format.ts · sidebar.ts · nav-state.ts · activity.ts · utils.ts
  sites.ts                       the websites (browser-safe types, access id `site:<id>`)
  site-photos.ts                 manifest fetch, drafts, publish + refresh, library, clean-up, public feed
  site-storage.ts                Vercel Blob (or local disk in dev)
  image-prep.ts                  browser-side shrink before upload
scripts/                         generate-secrets.mjs · hash-password.mjs
```

## 11. Runbook: everyday jobs

| Job | How |
|---|---|
| Add a person | Sign in as owner/admin → People & access → Add person → pick access per portal → copy the one-time password to them |
| Change someone's access | People & access → pencil. Takes effect on their next click |
| Someone forgot their password | People & access → key icon → give them the new one-time password |
| Someone left | Edit → untick "Account active" (keeps their notes), or delete them |
| Change the owner password | `npm run hash-password` → update `ADMIN_PASSWORD_HASH` in Vercel → redeploy |
| Sign everyone out | Change `SESSION_SECRET` in Vercel → redeploy |
| Rotate a project's key | Section 4 |
| Add a fourth portal | Add an entry to `PROJECTS` in `lib/projects.ts` (id, name, accent, `keyEnv`, `titleColumn`, `listColumns`); add the `INGEST_KEY_*` variable; add `HUB_INGEST_URL`/`KEY` to that project and send to `/api/ingest/<id>`. People's access matrix picks it up automatically. |
| Change the highlight colours/meanings | `lib/marks.ts` (ids are stored in the database; renaming an id orphans existing marks, so change labels/colours only) |
| Clear test entries | Portal table → tick → Delete (Manager+) |
| Free up space | Export to Excel first, then delete old entries; watch the Overview meter |
| Change website photos | Sidebar → RoadShield site photos → edit (autosaves as a draft) → a Manager presses **Publish**. Section 16 |
| Give someone website access | People & access → pencil → "RoadShield website": Viewer sees, Contributor edits drafts, Manager publishes |
| Make another spot on RoadShield editable | Only in the RoadShield repo: add a slot to `lib/photo-slots.ts` and read it with `slotPhotos(key)`. The hub picks it up automatically |
| Upgrade dependencies | `npm audit --omit=dev`; Next.js was moved to 16.4.1 for security fixes. Keep `pg` and `exceljs` in `serverExternalPackages` (`next.config.ts`) |

## 12. Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| `/api/health` shows `database:false` | `DATABASE_URL` missing/wrong, or Neon not connected to this project/environment → Vercel → Storage; redeploy |
| `/api/health` shows `adminLogin:false` | One of `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` (≥32) missing → add, redeploy |
| Changed a variable and nothing changed | Variables only apply to **new** deployments → Deployments → Redeploy |
| A project's entries don't appear in the hub | That project is missing `HUB_INGEST_URL`/`HUB_INGEST_KEY`, wrong portal in the URL, or key mismatch (401). Check that project's function logs ("Hub response not ok") and redeploy it |
| Ingest returns 401 | Key doesn't equal the hub's `INGEST_KEY_*` for that portal (also: key < 24 chars is rejected) |
| Ingest returns `{"duplicate":true}` | Identical headings + values were already stored (by design) |
| Site says "Submissions are not configured yet" (4W) | The project has neither Sheet, Brevo nor hub configured → set at least one |
| "Too many attempts" on sign-in | 8 failures from that IP in 15 minutes; wait, or it clears on a successful sign-in |
| Everyone got signed out | `SESSION_SECRET` changed, or the deploy that introduced multi-user changed the cookie format (one-time) |
| Someone sees "page not found" on a portal | They have no access to it → People & access. (404 is intentional for no access) |
| First page after a quiet spell is slow | Neon compute waking up; subsequent requests are fast |
| Sidebar counts missing | Person still has a temporary password → they must set their own on Account |
| Layout of columns looks wrong for one person | Their saved layout: Columns panel → **Default** |
| (Local testing) page stuck on a skeleton / won't hydrate | A *hidden* browser tab never runs `requestAnimationFrame`, so React never reveals streamed content. Make the tab visible (see section 13) |
| (Local) infinite reload loop in dev | Restarting `next dev` while a tab is open can leave the dev HMR client reloading; close the tab, restart the server, reopen |

## 13. Developing and testing

Commands: `npm run dev` (port 3400) · `npm run build` · `npm run lint` · `npx tsc --noEmit` · `npm run secrets` ·
`npm run hash-password`.

**Test approach used** (the scripts themselves are not committed; recreate if needed): a local Postgres
(`submissions_hub_dev`), the dev server on 3400, then a script that
1. seeds records through the real `/api/ingest/*` endpoints (including a wide 4W record with every real heading);
2. mints the **same signed session cookie the app issues** using `SESSION_SECRET` (`{i,u,v,exp}`, HMAC-SHA256,
   base64url) for people it creates through the real `createUserAction`;
3. discovers server-action ids from the dev client bundles and calls every action directly with and without a
   valid session, as each role, to prove refusals (a button being hidden is not security);
4. checks pages return the right HTTP status per role (404 for no access, redirects when signed out or when a
   password change is pending) and that nothing from another portal leaks;
5. checks disabled/reset/deleted people and tampered, expired, old-format or wrong-user cookies are refused;
6. checks highlights, notes (including note search, author-only delete), bulk operations, deletes cascade, saved
   layouts are per person and cleaned (widths clamped, junk dropped, ≤ 300 columns), and sort values with SQL
   injection strings are harmless.
That suite had 125 checks, all passing at the last release. A second suite (47 checks) covers website photos:
who can open/save/upload/publish/delete, draft validation (unknown spots, foreign photo addresses, another site's
photos, too many photos, bad focus points/layouts), publish blocked for incomplete frames or missing descriptions,
drafts never in the public feed, non-images and oversize uploads refused, clean-up of unused uploads, and the
site's refresh endpoint secret. RoadShield was also tested as a production build: Publish → visible on the next
visit, and with the hub switched off the site kept serving the last published photos (HTTP 200, never defaults or errors). UI behaviour (loaders, column panel, resize, sort,
sticky columns, collapsible menu, phone layout) was checked in a real browser, including at 375 px width.

**Gotchas when working on this code:**
- **A server component can't read a value exported from a `"use client"` file.** It gets a placeholder object,
  not the string. This caused the sidebar cookie to be ignored on the server until the name moved to `lib/sidebar.ts`.
  Keep shared constants in plain modules.
- **Next.js 16:** `params` and `searchParams` are Promises; `cookies()` and `headers()` are async.
- **`server-only`** is imported by `db.ts`, `auth.ts`, `users.ts`, `submissions.ts`, etc.: they can't be imported
  into client components. `lib/permissions.ts`, `lib/marks.ts`, `lib/format.ts`, `lib/nav-state.ts` are browser-safe.
- **Streaming status codes:** a `loading.tsx` boundary makes the response start before the page decides to
  `notFound()`/`redirect()`, returning HTTP 200 with a not-found screen. Access checks therefore live in layouts
  *above* the skeletons. A record id that doesn't exist (or belongs to another portal) still returns the not-found
  screen with status 200 on purpose, to keep the skeleton; no data is returned.
- **State updated inside a React transition is deferred** until the transition finishes (this made the progress
  bar not start for searches). `startNav()` is called before `startTransition`.
- **Testing in a hidden browser pane:** CSS transitions and `requestAnimationFrame` don't run, React's reveal of
  streamed content waits on rAF. Bring the pane to the front or take a screenshot to force a frame.
- **Server action ids differ in production builds**; the dev-bundle discovery trick above only works with `next dev`.
- Don't run `next build` while `next dev` is running in the same folder (they share `.next`).
- `AGENTS.md` is regenerated by `next dev` and is git-ignored.
- **Restarting `next dev` while a browser tab has the hub open** can leave that tab reloading in a loop (every
  page, every second). Close the tab, restart the server, then open it again.

## 14. Decisions, gotchas and known limits

- **Additive, not a replacement, on purpose.** The projects still write to their Sheets and send email, so the hub is
  a safe extra layer and a fallback exists if the hub is down.
- **Highlights and notes instead of Excel colouring.** The team coloured rows by hand; five meaningful colours plus notes
  cover that, and they survive in the Excel export.
- **"Edit" in the original request was interpreted as notes/highlights (Contributor) and delete (Manager).** Submitted
  answers are immutable: an untouched record is the point. Editing values with a visible history would be a deliberate
  addition.
- **Column layouts are personal.** There is no admin-set team default per portal (easy to add).
- **Excel export always includes every column**, regardless of the columns shown on screen.
- **No email from the hub** (no password-reset emails, no alerts). Admins hand out one-time passwords. A shared
  Brevo key for all projects was planned.
- **Hard deletes**, no recycle bin. The activity log records who deleted how many (not what).
- **Vercel's free (Hobby) plan is intended for non-commercial use.** These are client projects; the account may need
  to move to a paid plan, or the apps to another host, depending on how that plays out. The same applies to the
  other projects on Vercel.
- **Neon free-tier limits change.** Check the current limits when sizing.
- Everything shows **India time** (`Asia/Kolkata`); dates in filters are IST calendar days.

## 15. Related projects and history

| Project | Repo | Notes |
|---|---|---|
| 2W Ride Along | `akhilkashetty1/rideAlong2w` | **Migrated** from Create React App + Render Express to one Next.js app on Vercel. Domain `ride-along-form.in` (DNS at GoDaddy) points to Vercel (apex A record + `www` CNAME). Backend route replaces the old `rideAlongBackend`. In Oct 2026 the form got the 4W-style screens and mandatory answers (nothing pre-filled, secondary-vehicle fields required when chosen), in the 2W colours; the Sheet/hub columns are unchanged (the payload is tested identical to the old form's), so nothing changed here beyond the new `flagged` and `submittedAt` fields. The Rider Assessment also gained a last question about valid documents with *Driving licence valid till* / *Insurance valid till* columns (as on 4W), added at the end of the row; older 2W records simply have none of those columns. |
| 4W Ride Along | `akhilkashetty1/rideAlong4w` | Four-wheeler version; same architecture as RoadShield; 3D walkaround, offline outbox. Since Oct 2026 every Yes/No must be answered (nothing pre-filled), documents = Yes adds *Driving licence valid till* / *Insurance valid till* columns, and the primary/secondary vehicle questions are gone (new records have *Fuel Type*; older ones keep *Primary Vehicle…* / *Secondary…* columns, so both show up in the Columns panel). |
| RoadShield | `akhilkashetty1/roadshield1` | Marketing site; contact form posts here too. `main` is deployed; feature work happens on branches. |
| (retired) | `rideAlongProject/ride-along-form` (CRA + `gh-pages`), `rideAlongProject/rideAlongBackend` (Express on Render) | Old 2W stack. Keep archived. The old Brevo key committed in `rideAlongBackend`'s history **must stay revoked**. |

Timeline in short: hub built → added to Vercel with Neon → 2W moved off Render to Vercel (domain switched) → 3 projects
connected → multi-user access, highlights and notes → spreadsheet-style table with chosen columns → collapsible menu.
Google Sheets and Brevo email remain as parallel channels in each project.

## 16. Website photos (RoadShield)

Admins change the photos on the RoadShield website from here: the Gallery page (four sections, each with a
choice of layout), the Ride Smart and Drive Smart page heroes, their "Real bikes / Real cars" six-photo frames
and campaign creatives, the home page hero slideshows and mosaic, the classroom photos and Fleet Maintenance.

**How it fits together**

```
RoadShield (Next.js)                                   Hub
lib/photo-slots.ts  ── /api/site-manifest ───────────▶ editor: what spots exist, their rules, built-in photos
  each spot's built-in photos (the defaults)            drafts autosave in site_slots.draft
                                                       Publish (Manager) → site_slots.published
pages ◀── HUB_SITE_URL = /api/site/roadshield ─────────  public feed: published photos only
      ◀── POST /api/site-revalidate (secret) ──────────  then the hub opens each changed page once
photos: Vercel Blob (uploaded here) or the site's own /images/… files
```

- **The site describes itself.** Each photo spot ("slot") is listed in RoadShield's `lib/photo-slots.ts` with its
  rules (gallery = any number + layout; set = a range, e.g. 1–8; fixed = exactly N in a set design), how it crops,
  what each position means, and its built-in photos. The hub reads that list; nothing about RoadShield's pages is
  hard-coded here. Making a new spot editable is a RoadShield-only change.
- **It can't break the site.** RoadShield shows its built-in photos when `HUB_SITE_URL` isn't set, when a spot has
  never been published, or when published photos don't fit the spot. Pages are static with a 1-hour safety refresh;
  Publish triggers an immediate refresh (stale-while-revalidate), and the hub then opens each changed page so the
  next visitor sees the new photos. If the hub is unreachable during a refresh, the site keeps serving the last
  good page.
- **Drafts vs live.** Every edit autosaves as a draft (Contributor). Nothing changes on the site until a Manager
  presses Publish, which puts every changed spot live at once. Publish is refused (and nothing changes) while a
  fixed frame doesn't have its exact number of photos or a photo has no description. "Discard draft" goes back to
  what's live; "Site's originals" goes back to the built-in photos.
- **Uploads.** The browser shrinks photos (≤ 2400 px, WebP) to stay under Vercel's 4.5 MB request limit; the hub
  then decodes and re-encodes every upload with `sharp` (upright, ≤ 2400 px, WebP q82, camera data/location
  stripped), so only real images are stored. Typical size is 150–400 KB.
- **Storage.** Photos go to a **public Vercel Blob** store connected to the hub project; only their details are in
  Postgres. Blob's free allowance is separate from the database's. Uploads that nothing uses (removed from every
  draft and not live) are deleted automatically a day later, when someone next publishes; the Photo library also
  lets people delete unused uploads straight away. The site's own built-in photos are never deleted.
- **Editor features:** drag files onto a spot or use Add photos; drag (or arrows) to reorder; click a photo to
  write its description, set its label/caption and click its **focus point** (with a live crop preview); replace
  from an upload or the library; per-gallery layout (Masonry, Even grid, Featured, Carousel) and 2/3/4 columns,
  with a scaled-down preview. Viewers see everything read-only.

**Setting it up on Vercel (one time)**

1. Hub project → **Storage → Create → Blob**, access **Public**, connect it to the hub project (adds
   `BLOB_READ_WRITE_TOKEN`).
2. Generate a secret (`openssl rand -hex 24`). Hub: `SITE_URL_ROADSHIELD` = the RoadShield address,
   `SITE_SECRET_ROADSHIELD` = the secret. RoadShield: `HUB_SITE_URL` = `https://<hub>/api/site/roadshield`,
   `SITE_REVALIDATE_SECRET` = the same secret.
3. Redeploy both. Give people access under People & access → "RoadShield website".

**Local development:** run RoadShield (`npm run dev`, port 3200) with `HUB_SITE_URL=http://localhost:3400/api/site/roadshield`
and `SITE_REVALIDATE_SECRET`, and the hub with `SITE_URL_ROADSHIELD=http://localhost:3200` and
`SITE_SECRET_ROADSHIELD`. Without a Blob token the hub stores uploads in `.local-uploads/` (git-ignored) and
serves them from `/api/site-file/…`; RoadShield allows `localhost:3400` images only in development.

