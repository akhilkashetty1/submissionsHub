import Skeleton from "@/components/Skeleton";
import LoadingScreen from "@/components/LoadingScreen";

/** One submission while it loads. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading submission…" className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-44" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-60" />
            <Skeleton className="h-4 w-52" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="divide-y divide-line-soft overflow-hidden card">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[1fr_minmax(8rem,16rem)] sm:gap-6">
            <Skeleton className={`h-4 ${i % 3 === 0 ? "w-3/4" : "w-1/2"}`} />
            <Skeleton className="h-4 w-24 sm:ml-auto" />
          </div>
        ))}
      </div>
    </LoadingScreen>
  );
}
