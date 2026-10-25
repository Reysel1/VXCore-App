import { PageHeaderSkeleton, TabsSkeleton, CardGridSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <PageHeaderSkeleton />
      <TabsSkeleton count={5} />
      <CardGridSkeleton count={9} />
    </div>
  );
}
