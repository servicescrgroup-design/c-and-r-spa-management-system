import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStaffBranches } from "@/lib/pos/session";
import { getCombinedQueueData } from "@/lib/pos/queue-actions";
import { getFreelanceSessions } from "@/lib/pos/sale-actions";
import { QueueBoard } from "@/components/pos/queue-board";

export default async function QueuePage() {
  const branches = await getStaffBranches();

  if (branches.length === 0) {
    return <p className="text-sm text-muted-foreground">You are not assigned to any branch yet.</p>;
  }

  const supabase = await createServerSupabaseClient();
  const [{ queue, candidates, workDate }, freelancerLists, { data: services }] = await Promise.all([
    getCombinedQueueData(branches.map((b) => b.id)),
    Promise.all(branches.map(async (b) => (await getFreelanceSessions(b.id)).map((f) => ({ ...f, branchId: b.id })))),
    supabase.from("services").select("id, name").eq("is_active", true).order("name"),
  ]);

  const dateLabel = new Date(`${workDate}T12:00:00+07:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Today&apos;s queue</h1>
        <p className="text-muted-foreground">{dateLabel}</p>
      </div>

      <QueueBoard
        branches={branches}
        queue={queue}
        candidates={candidates}
        freelancers={freelancerLists.flat()}
        services={services ?? []}
      />
    </div>
  );
}
