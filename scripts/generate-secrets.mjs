// Prints fresh random secrets for .env.local / Vercel. Run: npm run secrets
import { randomBytes } from "node:crypto";

const secret = () => randomBytes(32).toString("base64url");

console.log(`# Paste into .env.local (local) and Vercel → Settings → Environment Variables (production)
SESSION_SECRET=${secret()}
INGEST_KEY_2W=${secret()}
INGEST_KEY_4W=${secret()}
INGEST_KEY_ROADSHIELD=${secret()}

# Each project gets its own key as its HUB_INGEST_KEY (2W ← INGEST_KEY_2W, 4W ← INGEST_KEY_4W, ...).
# Then create the admin password hash with: npm run hash-password`);
