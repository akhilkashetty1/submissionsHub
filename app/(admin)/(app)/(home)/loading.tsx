import Skeleton from "@/components/Skeleton";
import LoadingScreen from "@/components/LoadingScreen";

/** Overview while its numbers load. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading overview…" className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card p-5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="mt-2 h-3 w-28" />
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[0, 1, 2].map((j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-7 w-10" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-5 h-3 w-36" />
          </div>
        ))}
      </div>

      <div className="card p-5">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-4 h-2 w-full rounded-full" />
      </div>

      <div className="card">
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-44" />
        </div>
        <div className="divide-y divide-line">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-3 w-28 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </LoadingScreen>
  );
}
