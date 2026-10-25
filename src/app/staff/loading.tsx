import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={6} />
    </div>
  );
}
