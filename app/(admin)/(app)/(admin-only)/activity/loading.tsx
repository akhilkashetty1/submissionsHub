import Skeleton from "@/components/Skeleton";
import LoadingScreen from "@/components/LoadingScreen";

export default function Loading() {
  return (
    <LoadingScreen label="Loading activity…" className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="divide-y divide-line-soft overflow-hidden card">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    </LoadingScreen>
  );
}
