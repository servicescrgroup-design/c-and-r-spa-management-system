import Link from "next/link";
import { getStaffBranches } from "@/lib/pos/session";
import { getQueueData } from "@/lib/pos/queue-actions";
import { QueueBoard } from "@/components/pos/queue-board";
import { cn } from "@/lib/utils";

export default async function QueuePage({
  searchParams,
}: PageProps<"/pos/queue">) {
  const { branchId: requestedBranchId } = await searchParams;
  const branches = await getStaffBranches();

  if (branches.length === 0) {
    return <p className="text-sm text-muted-foreground">You are not assigned to any branch yet.</p>;
  }

  const branchId =
    (Array.isArray(requestedBranchId) ? requestedBranchId[0] : requestedBranchId) ?? branches[0].id;
  const activeBranch = branches.find((b) => b.id === branchId) ?? branches[0];

  const { queue, offDutyTherapists } = await getQueueData(activeBranch.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Today&apos;s queue</h1>
          <p className="text-muted-foreground">{activeBranch.name}</p>
        </div>
        {branches.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {branches.map((b) => (
              <Link
                key={b.id}
                href={`/pos/queue?branchId=${b.id}`}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  b.id === activeBranch.id ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {b.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <QueueBoard branchId={activeBranch.id} initialQueue={queue} offDutyTherapists={offDutyTherapists} />
    </div>
  );
}
