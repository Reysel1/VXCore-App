import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="flex-1 space-y-6 max-w-7xl mx-auto">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={9} />
    </div>
  );
}
