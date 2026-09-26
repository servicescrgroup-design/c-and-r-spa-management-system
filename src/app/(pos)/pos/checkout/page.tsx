import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStaffBranches, getMyOpenDrawer } from "@/lib/pos/session";
import { CheckoutCart } from "@/components/pos/checkout-cart";

export default async function CheckoutPage({
  searchParams,
}: PageProps<"/pos/checkout">) {
  const { branchId: branchIdParam } = await searchParams;
  const branches = await getStaffBranches();

  let activeBranchId = typeof branchIdParam === "string" ? branchIdParam : null;
  let drawer = activeBranchId ? await getMyOpenDrawer(activeBranchId) : null;

  if (!drawer) {
    for (const branch of branches) {
      const open = await getMyOpenDrawer(branch.id);
      if (open) {
        activeBranchId = branch.id;
        drawer = open;
        break;
      }
    }
  }

  if (!activeBranchId || !drawer) {
    redirect("/pos/register");
  }

  const supabase = await createServerSupabaseClient();
  const [
    { data: services },
    { data: categories },
    { data: overrides },
    { data: products },
    { data: packages },
    { data: customers },
    { data: staffRows },
    { data: therapistRoles },
    { data: profiles },
    { data: sessions },
  ] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, category_id, default_price_cents, duration_minutes, service_price_options(duration_minutes, price_cents, payout_cents)")
      .eq("is_active", true)
      .order("name"),
    supabase.from("service_categories").select("id, name, background_color").order("sort_order"),
    supabase.from("branch_service_overrides").select("service_id, is_offered").eq("branch_id", activeBranchId),
    supabase
      .from("products")
      .select("id, name, retail_price_cents")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("packages")
      .select("id, name, price_cents")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("customers")
      .select("id, first_name, last_name, email, auth_user_id")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase.from("staff").select("id"),
    supabase
      .from("staff_branch_roles")
      .select("staff_id, staff:staff_id(first_name, last_name)")
      .eq("role", "therapist")
      .eq("branch_id", activeBranchId),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
    supabase
      .from("therapist_clock_sessions")
      .select("staff_id, status")
      .eq("branch_id", activeBranchId)
      .is("clock_out_at", null),
  ]);

  // Staff logins are never customers.
  const staffIds = new Set((staffRows ?? []).map((s) => s.id));
  const customerList = (customers ?? [])
    .filter((c) => !c.auth_user_id || !staffIds.has(c.auth_user_id))
    .map(({ id, first_name, last_name, email }) => ({ id, first_name, last_name, email }));

  const notOffered = new Set((overrides ?? []).filter((o) => !o.is_offered).map((o) => o.service_id));
  const serviceList = (services ?? [])
    .filter((s) => !notOffered.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      category_id: s.category_id,
      default_price_cents: s.default_price_cents,
      durations:
        s.service_price_options.length > 0
          ? [...s.service_price_options]
              .sort((a, b) => a.duration_minutes - b.duration_minutes)
              .map((o) => ({ minutes: o.duration_minutes, priceCents: o.price_cents, payoutCents: o.payout_cents }))
          : [{ minutes: s.duration_minutes, priceCents: s.default_price_cents, payoutCents: 0 }],
    }));

  const nicknames = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));
  const statusByStaff = new Map((sessions ?? []).map((s) => [s.staff_id, s.status]));
  const seen = new Set<string>();
  const therapists = (therapistRoles ?? [])
    .filter((r) => !seen.has(r.staff_id) && seen.add(r.staff_id))
    .map((r) => {
      const full = `${r.staff?.first_name ?? ""} ${r.staff?.last_name ?? ""}`.trim();
      const nick = nicknames.get(r.staff_id);
      return { id: r.staff_id, name: nick ? `${nick} (${full})` : full || "Therapist", status: statusByStaff.get(r.staff_id) ?? null };
    })
    .sort((a, b) => Number(!a.status) - Number(!b.status) || a.name.localeCompare(b.name));

  const branchName = branches.find((b) => b.id === activeBranchId)?.name ?? "";

  return (
    <CheckoutCart
      branchId={activeBranchId}
      branchName={branchName}
      drawerSessionId={drawer.id}
      services={serviceList}
      categories={categories ?? []}
      therapists={therapists}
      products={products ?? []}
      packages={packages ?? []}
      customers={customerList}
    />
  );
}
