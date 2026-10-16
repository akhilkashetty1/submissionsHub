import Skeleton from "@/components/Skeleton";
import LoadingScreen from "@/components/LoadingScreen";

export default function Loading() {
  return (
    <LoadingScreen label="Loading people…" className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper shadow-sm">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="hidden h-6 w-44 sm:block" />
          </div>
        ))}
      </div>
    </LoadingScreen>
  );
}
