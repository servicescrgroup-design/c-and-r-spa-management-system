import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StaffContext } from "@/lib/auth/roles";

export async function getStaffContext(): Promise<StaffContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select("id, first_name, last_name, email, staff_branch_roles(branch_id, role)")
    .eq("id", user.id)
    .maybeSingle();

  if (!staff) return null;

  return {
    staffId: staff.id,
    firstName: staff.first_name,
    lastName: staff.last_name,
    email: staff.email,
    roles: (staff.staff_branch_roles ?? []).map((r) => ({
      branchId: r.branch_id,
      role: r.role,
    })),
  };
}

export async function requireStaffContext(): Promise<StaffContext> {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/auth/staff-login");
  return ctx;
}

export async function getCustomerId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return customer?.id ?? null;
}

export async function requireCustomerId(): Promise<string> {
  const id = await getCustomerId();
  if (!id) redirect("/auth/customer-login");
  return id;
}
