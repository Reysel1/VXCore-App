import { PageHeaderSkeleton, TableCardSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <PageHeaderSkeleton />
      <TableCardSkeleton rows={8} columns={5} />
    </div>
  );
}
