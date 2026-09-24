import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStaffBranches, getOrCreateRegister, getOpenDrawerSession } from "@/lib/pos/session";
import { CheckoutCart } from "@/components/pos/checkout-cart";

export default async function CheckoutPage({
  searchParams,
}: PageProps<"/pos/checkout">) {
  const { branchId: branchIdParam } = await searchParams;
  const branches = await getStaffBranches();

  let activeBranchId = typeof branchIdParam === "string" ? branchIdParam : null;
  let drawer = null;

  if (activeBranchId) {
    const register = await getOrCreateRegister(activeBranchId);
    drawer = await getOpenDrawerSession(register.id);
  } else {
    for (const branch of branches) {
      const register = await getOrCreateRegister(branch.id);
      const open = await getOpenDrawerSession(register.id);
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
  const [{ data: services }, { data: products }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, default_price_cents")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, retail_price_cents")
      .eq("is_active", true)
      .order("name"),
  ]);

  const branchName = branches.find((b) => b.id === activeBranchId)?.name ?? "";

  return (
    <CheckoutCart
      branchId={activeBranchId}
      branchName={branchName}
      drawerSessionId={drawer.id}
      services={services ?? []}
      products={products ?? []}
    />
  );
}
