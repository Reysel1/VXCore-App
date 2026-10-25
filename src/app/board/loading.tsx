import { PageHeaderSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <PageHeaderSkeleton />
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, col) => (
          <div key={col} className="space-y-3 rounded-xl border border-border/50 p-3">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 4 - col }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
