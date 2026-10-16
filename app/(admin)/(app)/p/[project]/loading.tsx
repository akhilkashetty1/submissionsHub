import Skeleton from "@/components/Skeleton";
import LoadingScreen from "@/components/LoadingScreen";

/** A form's submissions list while it loads. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading submissions…" className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-44 rounded-lg" />
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-paper p-4 shadow-sm">
        <Skeleton className="h-10 min-w-[14rem] flex-1 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
        <Skeleton className="h-10 w-20 rounded-lg" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-sm">
        <div className="flex items-center gap-4 bg-paper-2 px-4 py-3.5">
          {["w-4", "w-20", "w-24", "w-16", "w-20", "w-24"].map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="hidden h-3.5 w-20 sm:block" />
              <Skeleton className="hidden h-3.5 w-24 md:block" />
              <Skeleton className="hidden h-3.5 w-24 lg:block" />
              <Skeleton className="ml-auto h-5 w-9 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </LoadingScreen>
  );
}
