import { PageHeaderSkeleton, StatCardsSkeleton, TableCardSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <div className="grid gap-4 lg:grid-cols-7">
        <div className="lg:col-span-4">
          <TableCardSkeleton rows={4} columns={2} />
        </div>
        <div className="lg:col-span-3">
          <TableCardSkeleton rows={4} columns={2} />
        </div>
      </div>
    </div>
  );
}
