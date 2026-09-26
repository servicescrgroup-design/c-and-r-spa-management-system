"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import type { Enums } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };
type BedType = Enums<"bed_type">;

function canManage(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

export type RoomWithBeds = {
  id: string;
  name: string;
  beds: { id: string; name: string; bedType: BedType }[];
};

export async function getRoomsWithBeds(branchId: string): Promise<RoomWithBeds[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const [{ data: rooms }, { data: beds }] = await Promise.all([
    supabase.from("branch_rooms").select("id, name").eq("branch_id", branchId).eq("is_active", true).order("name"),
    supabase.from("room_beds").select("id, room_id, name, bed_type").eq("is_active", true),
  ]);

  const bedsByRoom = new Map<string, RoomWithBeds["beds"]>();
  for (const b of beds ?? []) {
    const list = bedsByRoom.get(b.room_id) ?? [];
    list.push({ id: b.id, name: b.name, bedType: b.bed_type });
    bedsByRoom.set(b.room_id, list);
  }

  return (rooms ?? []).map((r) => ({ id: r.id, name: r.name, beds: bedsByRoom.get(r.id) ?? [] }));
}

export async function createRoom(branchId: string, name: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManage(ctx)) return { ok: false, error: "Only an owner or manager can add rooms." };
  if (!name.trim()) return { ok: false, error: "Room name is required." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("branch_rooms").insert({ branch_id: branchId, name: name.trim() });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/scheduling");
  return { ok: true };
}

export async function createBed(roomId: string, name: string, bedType: BedType): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManage(ctx)) return { ok: false, error: "Only an owner or manager can add beds." };
  if (!name.trim()) return { ok: false, error: "Bed name is required." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("room_beds").insert({ room_id: roomId, name: name.trim(), bed_type: bedType });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/scheduling");
  return { ok: true };
}

export type BedAvailability = { bedId: string; occupied: boolean; compatible: boolean };

/** For a proposed time window, which beds are already booked, and which bed types
 * actually support every selected service (never invented — reads bed_type_allowed_services). */
export async function getBedAvailability(input: {
  branchId: string;
  startAt: string;
  endAt: string;
  serviceIds: string[];
  excludeAppointmentId?: string;
}): Promise<Record<string, BedAvailability>> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const rooms = await getRoomsWithBeds(input.branchId);
  const allBeds = rooms.flatMap((r) => r.beds);
  if (allBeds.length === 0) return {};

  let query = supabase
    .from("appointments")
    .select("bed_id, start_at, end_at")
    .eq("branch_id", input.branchId)
    .not("bed_id", "is", null)
    .not("status", "in", "(cancelled,no_show)")
    .lt("start_at", input.endAt)
    .gt("end_at", input.startAt);
  if (input.excludeAppointmentId) query = query.neq("id", input.excludeAppointmentId);
  const { data: overlapping } = await query;
  const occupiedBedIds = new Set((overlapping ?? []).map((a) => a.bed_id));

  let compatibleBedTypes: Set<BedType> | null = null;
  if (input.serviceIds.length > 0) {
    const { data: allowed } = await supabase
      .from("bed_type_allowed_services")
      .select("bed_type, service_id")
      .in("service_id", input.serviceIds);
    const byType = new Map<BedType, Set<string>>();
    for (const row of allowed ?? []) {
      const set = byType.get(row.bed_type) ?? new Set<string>();
      set.add(row.service_id);
      byType.set(row.bed_type, set);
    }
    compatibleBedTypes = new Set(
      Array.from(byType.entries())
        .filter(([, services]) => input.serviceIds.every((id) => services.has(id)))
        .map(([type]) => type),
    );
  }

  const result: Record<string, BedAvailability> = {};
  for (const bed of allBeds) {
    result[bed.id] = {
      bedId: bed.id,
      occupied: occupiedBedIds.has(bed.id),
      compatible: compatibleBedTypes === null || compatibleBedTypes.has(bed.bedType),
    };
  }
  return result;
}

export async function createStaffAppointment(input: {
  branchId: string;
  bedId: string | null;
  customer: { name: string; email: string; phone: string; nationality: string };
  serviceIds: string[];
  durationMinutes: number;
  priceCents: number;
  startAt: string;
}): Promise<ActionResult & { appointmentId?: string }> {
  const ctx = await requireStaffContext();
  if (input.serviceIds.length === 0) return { ok: false, error: "Select at least one service." };
  if (!input.customer.name.trim()) return { ok: false, error: "Customer name is required." };

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const [firstName, ...rest] = input.customer.name.trim().split(" ").filter(Boolean);
  let customerId: string | null = null;
  if (input.customer.phone.trim()) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", input.customer.phone.trim())
      .maybeSingle();
    if (existing) customerId = existing.id;
  }
  if (!customerId) {
    const { data: created, error } = await supabase
      .from("customers")
      .insert({
        org_id: org.id,
        first_name: firstName || "Guest",
        last_name: rest.join(" "),
        email: input.customer.email.trim() || null,
        phone: input.customer.phone.trim() || null,
        nationality: input.customer.nationality.trim() || null,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: error?.message ?? "Could not create customer." };
    customerId = created.id;
  }

  const startAt = new Date(input.startAt);
  const endAt = new Date(startAt.getTime() + input.durationMinutes * 60_000);

  const { data: appointment, error: apptError } = await supabase
    .from("appointments")
    .insert({
      org_id: org.id,
      branch_id: input.branchId,
      customer_id: customerId,
      created_by_staff_id: ctx.staffId,
      status: "confirmed",
      source: "staff",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      bed_id: input.bedId,
    })
    .select("id")
    .single();
  if (apptError || !appointment) return { ok: false, error: apptError?.message ?? "Could not create appointment." };

  const { error: servicesError } = await supabase.from("appointment_services").insert(
    input.serviceIds.map((serviceId, i) => ({
      appointment_id: appointment.id,
      service_id: serviceId,
      price_cents: i === 0 ? input.priceCents : 0,
      duration_minutes: input.durationMinutes,
      sort_order: i,
    })),
  );
  if (servicesError) return { ok: false, error: servicesError.message };

  revalidatePath("/admin/scheduling");
  return { ok: true, appointmentId: appointment.id };
}
