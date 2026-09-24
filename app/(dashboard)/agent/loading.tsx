import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy aria-label="Loading">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <Skeleton className="hidden h-96 rounded-2xl lg:block" />
        <Skeleton className="h-[calc(100dvh-17rem)] min-h-[26rem] rounded-2xl lg:h-[calc(100dvh-14rem)]" />
      </div>
    </div>
  );
}
