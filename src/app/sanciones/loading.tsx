import { PageHeaderSkeleton, TabsSkeleton, ListDetailSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <PageHeaderSkeleton />
      <TabsSkeleton count={5} />
      <ListDetailSkeleton />
    </div>
  );
}
