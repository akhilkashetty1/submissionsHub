import Logo from "@/components/Logo";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import { PROJECTS } from "@/lib/projects";
import PortalIcon from "@/components/PortalIcon";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/account" : "/");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">Submissions Hub</span>
        </div>

        <div className="mx-auto flex w-full max-w-[22rem] flex-1 flex-col justify-center py-12">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em]">Welcome back</h1>
          <p className="mt-2 text-sm text-muted">Sign in to review submissions from your forms.</p>
          <div className="mt-8">
            <LoginForm next={next ?? ""} />
          </div>
        </div>

        <p className="text-xs text-faint">2W · 4W Ride Along · RoadShield</p>
      </section>

      <aside aria-hidden className="relative m-2 hidden overflow-hidden rounded-2xl bg-night lg:block">
        <div className="dot-grid absolute inset-0" />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand opacity-[0.22] blur-[110px]" />
        <div className="absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-[#da1f26] opacity-[0.14] blur-[110px]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <div className="mb-10 w-full max-w-md space-y-2.5">
            {PROJECTS.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/[0.08] backdrop-blur"
                style={{ marginLeft: `${i * 1.5}rem` }}
              >
                <PortalIcon id={p.id} accent={p.accent} size="sm" />
                <span className="text-sm font-medium text-white/90">{p.name}</span>
              </div>
            ))}
          </div>
          <p className="max-w-md text-2xl font-semibold leading-snug tracking-[-0.02em] text-white">Every submission, in one place.</p>
          <p className="mt-2 max-w-md text-sm text-white/50">Search, highlight and note records from every form, then export to Excel when you need it.</p>
        </div>
      </aside>
    </main>
  );
}
