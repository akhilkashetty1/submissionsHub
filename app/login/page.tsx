import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-night px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand font-bold text-night">S</span>
          <div>
            <h1 className="text-lg font-semibold text-white">Submissions Hub</h1>
            <p className="text-sm text-[#8b919c]">2W · 4W Ride Along · RoadShield</p>
          </div>
        </div>
        <LoginForm next={next ?? ""} />
      </div>
    </main>
  );
}
