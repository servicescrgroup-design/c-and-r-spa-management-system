import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStaffBranches } from "@/lib/pos/session";
import { SaleFlow } from "@/components/pos/sale-flow";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default async function SalePage({ searchParams }: PageProps<"/pos/sale">) {
  const { branchId: branchIdParam } = await searchParams;
  const branches = await getStaffBranches();
  const activeBranchId = (typeof branchIdParam === "string" ? branchIdParam : branches[0]?.id) ?? null;

  if (!activeBranchId) {
    return <p className="text-muted-foreground">You aren&apos;t assigned to a branch yet.</p>;
  }

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

      {branches.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link
              key={b.id}
              href={`/pos/sale?branchId=${b.id}`}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                b.id === activeBranchId ? "border-primary bg-primary text-primary-foreground" : "border-border",
              )}
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}

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
