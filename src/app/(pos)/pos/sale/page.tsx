import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getWorkingBranch } from "@/lib/pos/session";
import { SaleFlow } from "@/components/pos/sale-flow";

export default async function SalePage() {
  // The store is set once, by the register drawer opened this morning.
  const working = await getWorkingBranch();
  if (!working) redirect("/pos/register");
  const activeBranchId = working.branch.id;

  const supabase = await createServerSupabaseClient();
  const [{ data: services }, { data: rooms }, { data: occupiedSessions }, { data: branch }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, name_th, category_id")
      .eq("is_active", true)
      .order("name"),
    supabase.from("branch_rooms").select("id, name").eq("branch_id", activeBranchId).order("name"),
    supabase
      .from("therapist_clock_sessions")
      .select("current_room_id")
      .eq("branch_id", activeBranchId)
      .is("clock_out_at", null)
      .not("current_room_id", "is", null),
    supabase.from("branches").select("transportation_fee_cents").eq("id", activeBranchId).single(),
  ]);

  const occupiedRoomIds = (occupiedSessions ?? [])
    .map((s) => s.current_room_id)
    .filter((id): id is string => Boolean(id));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">New sale</h1>
        <p className="text-muted-foreground">Select services, confirm the therapist, then check out.</p>
      </div>

      <SaleFlow
        branchId={activeBranchId}
        services={services ?? []}
        rooms={rooms ?? []}
        occupiedRoomIds={occupiedRoomIds}
        suggestedTransportationFeeCents={branch?.transportation_fee_cents ?? 0}
      />
    </div>
  );
}
