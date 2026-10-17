import Skeleton from "@/components/Skeleton";
import LoadingScreen from "@/components/LoadingScreen";

/** The website photo editor while it loads. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading website photos…" className="mx-auto max-w-[80rem] space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="card space-y-4 p-5">
          <Skeleton className="h-5 w-56" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, j) => (
              <Skeleton key={j} className="aspect-[4/3] w-full rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </LoadingScreen>
  );
}
