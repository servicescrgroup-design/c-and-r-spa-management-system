import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { RegisterShifts, type Shift } from "@/components/admin/register-shifts";

function personName(p: { first_name: string; last_name: string } | null) {
  return p ? `${p.first_name} ${p.last_name}`.trim() : null;
}

export default async function RegisterDetailPage({ params }: PageProps<"/admin/registers/[registerId]">) {
  const ctx = await requireStaffContext();
  const { registerId } = await params;
  const supabase = await createServerSupabaseClient();

  const [{ data: register }, { data: sessions }] = await Promise.all([
    supabase.from("pos_registers").select("id, name, branch:branch_id(name)").eq("id", registerId).maybeSingle(),
    supabase
      .from("cash_drawer_sessions")
      .select(
        "id, status, opened_at, closed_at, opening_amount_cents, expected_amount_cents, counted_amount_cents, variance_cents, opened_by:opened_by_staff_id(first_name, last_name), closed_by:closed_by_staff_id(first_name, last_name)",
      )
      .eq("register_id", registerId)
      .order("opened_at", { ascending: false })
      .limit(40),
  ]);
  if (!register) notFound();

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: transactions } = sessionIds.length
    ? await supabase
        .from("pos_transactions")
        .select("id, drawer_session_id, created_at, customer_ref, customer_name, total_cents, status, pos_payments(method, amount_cents)")
        .in("drawer_session_id", sessionIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const shifts: Shift[] = (sessions ?? []).map((s) => {
    const sales = (transactions ?? []).filter((t) => t.drawer_session_id === s.id);
    const byMethod: Record<string, number> = {};
    for (const t of sales) for (const p of t.pos_payments ?? []) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount_cents;
    return {
      id: s.id,
      status: s.status,
      openedAt: s.opened_at,
      closedAt: s.closed_at,
      openedBy: personName(s.opened_by),
      closedBy: personName(s.closed_by),
      openingCents: s.opening_amount_cents,
      expectedCents: s.expected_amount_cents,
      countedCents: s.counted_amount_cents,
      varianceCents: s.variance_cents,
      cashTakenCents: byMethod.cash ?? 0,
      takenByMethod: byMethod,
      sales: sales.map((t) => ({
        id: t.id,
        createdAt: t.created_at,
        ref: t.customer_ref,
        name: t.customer_name,
        totalCents: t.total_cents,
        status: t.status,
        methods: Array.from(new Set((t.pos_payments ?? []).map((p) => p.method))),
      })),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/registers" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; All registers
        </Link>
        <h1 className="font-display mt-1 text-3xl font-medium tracking-tight">{register.name}</h1>
        <p className="text-muted-foreground">{register.branch?.name}</p>
      </div>
      <RegisterShifts shifts={shifts} canEdit={isOwner(ctx) || ctx.roles.some((r) => r.role === "manager")} />
    </div>
  );
}
