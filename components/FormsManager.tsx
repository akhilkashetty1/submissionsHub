"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, Lock, LockOpen } from "lucide-react";
import { saveFormStatusAction } from "@/app/form-actions";
import Modal from "@/components/Modal";
import PortalIcon from "@/components/PortalIcon";
import { DEFAULT_CLOSED, FORM_LIMITS, MESSAGE_PRESETS } from "@/lib/form-status-defaults";
import { cn } from "@/lib/utils";

export type FormRow = {
  id: string;
  name: string;
  accent: string;
  open: boolean;
  title: string;
  message: string;
  updatedBy: string | null;
  updatedAt: string | null;
};

/** A small copy of the screen riders get while the form is closed, so the words can be judged before saving. */
function ClosedPreview({ title, message }: { title: string; message: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-night text-center text-white ring-1 ring-night-line">
      <div className="flex flex-col items-center gap-3 px-6 py-8">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 ring-1 ring-white/15">
          <Lock className="h-5 w-5 text-brand" />
        </span>
        <p className="text-base font-semibold tracking-tight">{title || DEFAULT_CLOSED.title}</p>
        <p className="max-w-sm whitespace-pre-line text-[0.8125rem] leading-relaxed text-white/70">{message || DEFAULT_CLOSED.message}</p>
      </div>
    </div>
  );
}

function FormCard({ form }: { form: FormRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(form.title);
  const [message, setMessage] = useState(form.message);
  const [confirm, setConfirm] = useState<"close" | "open" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changed = title.trim() !== form.title.trim() || message.trim() !== form.message.trim();
  const short = form.name.replace(" Ride Along", "");

  const run = (input: { open?: boolean; title?: string; message?: string }, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await saveFormStatusAction({ project: form.id, ...input });
      if (!res.ok) return setError(res.error);
      after?.();
      router.refresh();
    });

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3.5">
          <PortalIcon id={form.id} accent={form.accent} size="lg" />
          <div>
            <h2 className="text-base font-semibold tracking-tight">{form.name}</h2>
            <p className={cn("mt-0.5 flex items-center gap-1.5 text-[0.8125rem] font-medium", form.open ? "text-ok" : "text-flag")}>
              <span className={cn("h-2 w-2 rounded-full", form.open ? "bg-ok" : "bg-flag")} />
              {form.open ? "Taking submissions" : "Closed: riders see the message below"}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.open}
          aria-label={`${form.name} is ${form.open ? "open" : "closed"}`}
          onClick={() => setConfirm(form.open ? "close" : "open")}
          className={cn("btn", form.open ? "btn-secondary" : "btn-primary")}
        >
          {form.open ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
          {form.open ? "Close the form" : "Open the form"}
        </button>
      </div>

      <div className="space-y-4 border-t border-line-soft bg-[#fafafa] p-5">
        <div>
          <h3 className="text-[0.8125rem] font-semibold">What riders see when it&rsquo;s closed</h3>
          <p className="mt-0.5 text-xs text-muted">Leave the boxes empty to use the standard words. Nothing changes for riders until you press Save.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Quick pick:</span>
          {MESSAGE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setTitle(p.title);
                setMessage(p.message);
                setSaved(false);
              }}
              className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-ink-soft transition hover:border-line-strong hover:text-ink"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor={`${form.id}-title`}>
                Heading
              </label>
              <input
                id={`${form.id}-title`}
                className="field"
                value={title}
                maxLength={FORM_LIMITS.title}
                placeholder={DEFAULT_CLOSED.title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSaved(false);
                }}
              />
            </div>
            <div>
              <label className="label" htmlFor={`${form.id}-message`}>
                Message
              </label>
              <textarea
                id={`${form.id}-message`}
                className="field"
                rows={4}
                value={message}
                maxLength={FORM_LIMITS.message}
                placeholder={DEFAULT_CLOSED.message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setSaved(false);
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={pending || !changed} onClick={() => run({ title, message }, () => setSaved(true))} className="btn btn-primary btn-sm">
                {pending && !confirm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved && !changed ? <Check className="h-3.5 w-3.5" /> : null}
                {saved && !changed ? "Saved" : "Save message"}
              </button>
              {(title || message) && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setTitle("");
                    setMessage("");
                    setSaved(false);
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Use standard words
                </button>
              )}
            </div>
            {error && !confirm && (
              <p role="alert" className="text-xs font-medium text-flag">
                {error}
              </p>
            )}
          </div>
          <div>
            <p className="label">Preview</p>
            <ClosedPreview title={title.trim()} message={message.trim()} />
          </div>
        </div>

        <p className="text-xs text-faint">{form.updatedAt ? `Last changed by ${form.updatedBy ?? "someone"} · ${form.updatedAt}` : "Never changed: the form is open."}</p>
      </div>

      {confirm && (
        <Modal title={confirm === "close" ? `Close the ${short} form?` : `Open the ${short} form?`} onClose={() => !pending && setConfirm(null)}>
          {confirm === "close" ? (
            <div className="space-y-3 text-[0.8125rem] leading-relaxed text-ink-soft">
              <p>Riders will see the message below instead of the form, right away for anyone who opens it, and within about a minute for anyone already on it.</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Entries already submitted are not affected.</li>
                <li>Someone halfway through keeps their answers on their phone and can send once you open the form again.</li>
              </ul>
              <ClosedPreview title={title.trim()} message={message.trim()} />
            </div>
          ) : (
            <p className="text-[0.8125rem] leading-relaxed text-ink-soft">The {short} form goes back to normal: riders can start and submit again.</p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-xs font-medium text-flag">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={pending} onClick={() => setConfirm(null)} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run({ open: confirm === "open", ...(confirm === "close" && changed ? { title, message } : {}) }, () => setConfirm(null))}
              className={cn("btn", confirm === "close" ? "btn-danger" : "btn-primary")}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm === "close" ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
              {confirm === "close" ? "Close the form" : "Open the form"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export default function FormsManager({ forms }: { forms: FormRow[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Forms</h1>
        <p className="page-sub">Open or close the ride-along forms. While a form is closed, riders see a &ldquo;submissions ended&rdquo; screen and can&rsquo;t submit. Only admins can change this.</p>
      </div>
      {forms.map((f) => (
        <FormCard key={f.id} form={f} />
      ))}
    </div>
  );
}
