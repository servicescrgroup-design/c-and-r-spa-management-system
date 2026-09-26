"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Name a walk-in sale or link it to a customer after the session. */
export async function setSaleCustomer(
  transactionId: string,
  input: { customerName: string | null; customerId: string | null },
): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_sale_customer", {
    p_transaction_id: transactionId,
    // The function accepts null for both; generated types mark them as strings.
    p_customer_name: (input.customerName?.trim() || null) as unknown as string,
    p_customer_id: (input.customerId || null) as unknown as string,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos/sales");
  revalidatePath("/admin/scheduling");
  return { ok: true };
}

export type CustomerMatch = { id: string; name: string; phone: string | null; email: string | null };

/** Customer search for linking a sale. Staff logins are never returned. */
export async function searchCustomers(query: string): Promise<CustomerMatch[]> {
  await requireStaffContext();
  const q = query.trim().replace(/[%,()]/g, "");
  if (q.length < 2) return [];
  const supabase = await createServerSupabaseClient();
  const [{ data }, { data: staff }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email, auth_user_id")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10),
    supabase.from("staff").select("id"),
  ]);
  const staffIds = new Set((staff ?? []).map((s) => s.id));
  return (data ?? [])
    .filter((c) => !c.auth_user_id || !staffIds.has(c.auth_user_id))
    .map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`.trim() || "Customer",
      phone: c.phone,
      email: c.email,
    }));
}

/** Creates a customer from a name and phone and links the sale to them. */
export async function createCustomerForSale(
  transactionId: string,
  input: { name: string; phone: string },
): Promise<ActionResult> {
  await requireStaffContext();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Enter the customer's name." };
  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };
  const [firstName, ...rest] = name.split(" ").filter(Boolean);
  const { data: created, error } = await supabase
    .from("customers")
    .insert({ org_id: org.id, first_name: firstName, last_name: rest.join(" "), phone: input.phone.trim() || null })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Could not create customer." };
  return setSaleCustomer(transactionId, { customerName: null, customerId: created.id });
}
