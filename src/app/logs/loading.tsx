import { PageHeaderSkeleton, TabsSkeleton, TableCardSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 w-full max-w-7xl mx-auto">
      <PageHeaderSkeleton />
      <TabsSkeleton count={4} />
      <TableCardSkeleton rows={10} columns={4} />
    </div>
  );
}
