"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

/**
 * Excel download with real progress. The file is built on the server and can take a
 * moment, and a plain link gives no sign anything is happening. This fetches it, shows
 * a spinner until it arrives, then saves it, and reports a failure instead of silence.
 */
export default function ExportButton({ href, label, className }: { href: string; label: string; className: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(res.status === 401 ? "Your session expired. Sign in again." : "Export failed. Try again.");
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "submissions.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={run} disabled={busy} className={className} aria-busy={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? "Preparing…" : label}
      </button>
      {error && (
        <span role="alert" className="absolute right-0 top-full z-10 mt-2 w-max max-w-[16rem] rounded-lg bg-flag px-3 py-2 text-xs font-medium text-white shadow-lg">
          {error}
        </span>
      )}
    </span>
  );
}
