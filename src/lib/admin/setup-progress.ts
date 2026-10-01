import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SetupStep = {
  id: string;
  title: string;
  /** One line on why the step matters for running the shop. */
  why: string;
  /** What to click, in order. */
  how: string[];
  tip: string;
  href: string;
  cta: string;
  done: boolean;
  /** Short proof of what was found, e.g. "6 massages, 14 prices". */
  found: string | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Each setup step, ticked off from what is already in the system. */
export async function getSetupProgress(): Promise<SetupStep[]> {
  const supabase = await createServerSupabaseClient();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const [branches, services, prices, beds, registers, therapists, desk, drawers, closedDrawers, sales, bookings, expenses, checklist] =
    await Promise.all([
      supabase.from("branches").select("id, hours").eq("is_active", true),
      count(supabase.from("services").select("id", { count: "exact", head: true }).eq("is_active", true)),
      count(supabase.from("service_price_options").select("id", { count: "exact", head: true })),
      count(supabase.from("room_beds").select("id", { count: "exact", head: true })),
      count(supabase.from("pos_registers").select("id", { count: "exact", head: true })),
      count(supabase.from("staff_branch_roles").select("staff_id", { count: "exact", head: true }).eq("role", "therapist")),
      count(supabase.from("staff_branch_roles").select("staff_id", { count: "exact", head: true }).in("role", ["front_desk", "manager"])),
      count(supabase.from("cash_drawer_sessions").select("id", { count: "exact", head: true })),
      count(supabase.from("cash_drawer_sessions").select("id", { count: "exact", head: true }).not("closed_at", "is", null)),
      count(supabase.from("pos_transactions").select("id", { count: "exact", head: true })),
      count(supabase.from("appointments").select("id", { count: "exact", head: true })),
      count(supabase.from("expenses").select("id", { count: "exact", head: true })),
      count(supabase.from("checklist_items").select("id", { count: "exact", head: true }).eq("is_active", true)),
    ]);

  const storeRows = branches.data ?? [];
  const withHours = storeRows.filter((b) => b.hours && Object.keys(b.hours as object).length > 0).length;

  return [
    {
      id: "stores",
      title: "Add your stores and opening hours",
      why: "Every sale, booking and payroll day belongs to a store. Closing time also decides when a therapist left early.",
      how: ["Open Branches.", "Add each store with its address and phone.", "Set the opening hours for every day you open."],
      tip: "Give each store its own colour. Combined views then show a blend, so you always know which numbers you're looking at.",
      href: "/admin/branches",
      cta: "Open Branches",
      done: storeRows.length > 0 && withHours === storeRows.length,
      found: storeRows.length ? `${plural(storeRows.length, "store")}, ${withHours} with hours` : null,
    },
    {
      id: "menu",
      title: "Build your massage menu",
      why: "Checkout, bookings and therapist pay all read from the menu, so prices are typed once.",
      how: [
        "Open Services and add a category, e.g. Thai, Oil, Foot.",
        "Add each massage with its lengths, e.g. 60, 90, 120 min.",
        "For each length, set the price and what the therapist earns (ค่ามือ).",
      ],
      tip: "Select several services with the checkboxes to change prices in one go when you raise prices.",
      href: "/admin/services",
      cta: "Open Services",
      done: services > 0 && prices > 0,
      found: services ? `${plural(services, "massage")}, ${plural(prices, "price")}` : null,
    },
    {
      id: "rooms",
      title: "Add rooms and beds",
      why: "Bookings and walk-ins are placed on a bed, so two guests never get the same bed at the same time.",
      how: ["Open Scheduling.", "Add a room per space, then its beds or foot chairs.", "Drag to put them in the order your staff walk them."],
      tip: "Set the bed type (mat, oil table, foot chair). The system then hides beds that don't suit the massage.",
      href: "/admin/scheduling",
      cta: "Open Scheduling",
      done: beds > 0,
      found: beds ? plural(beds, "bed") : null,
    },
    {
      id: "register",
      title: "Create a cash register",
      why: "Front desk opens a drawer on a register to sell. Cash in and out is counted per drawer.",
      how: ["Open Registers.", "Add one register per counter, e.g. “Front desk”.", "Choose which staff may use it."],
      tip: "One register per store is enough for most shops. Two people can share an open drawer.",
      href: "/admin/registers",
      cta: "Open Registers",
      done: registers > 0,
      found: registers ? plural(registers, "register") : null,
    },
    {
      id: "staff",
      title: "Add your staff",
      why: "Therapists check in to the queue and get paid from their jobs. Front desk runs the POS.",
      how: [
        "Open Staff and use Add staff.",
        "Choose “Create login now”, type their name, email and a password, and pick the role and store.",
        "Tell them the password in person. They sign in at the staff log in page.",
      ],
      tip: "Turn off the daily guarantee for trainees on the Therapists page until they're ready.",
      href: "/admin/staff",
      cta: "Open Staff",
      done: therapists > 0 && desk > 0,
      found: therapists || desk ? `${plural(therapists, "therapist")}, ${desk} front desk or admin` : null,
    },
    {
      id: "checklist",
      title: "Set your opening and closing checklist",
      why: "Staff tick items off on the POS. At 2pm someone checks the morning was done properly.",
      how: ["Open Checklists.", "Add opening, midday and closing items for each store, e.g. “Fill hot water”."],
      tip: "Keep each item to one action you can see. “Towels folded on shelf 2” beats “Prepare towels”.",
      href: "/admin/checklists",
      cta: "Open Checklists",
      done: checklist > 0,
      found: checklist ? plural(checklist, "item") : null,
    },
    {
      id: "drawer",
      title: "Open the drawer",
      why: "The day starts by counting the float, so the cash at close can be checked against sales.",
      how: ["Go to the POS.", "Pick the register and count the float by note and coin.", "Open the drawer."],
      tip: "Keep the same float every day, e.g. ฿2,000. The report keeps it out of the cash to send.",
      href: "/pos/register",
      cta: "Open the POS",
      done: drawers > 0,
      found: drawers ? plural(drawers, "drawer") + " opened" : null,
    },
    {
      id: "sale",
      title: "Ring up your first sale",
      why: "This is the daily loop: pick the massage, the therapist and the start time, then take payment.",
      how: ["Have a therapist check in on the Queue.", "Open Checkout, add a massage and pick the therapist.", "Take cash, PromptPay or card."],
      tip: "The therapist list is in queue order. #1 is next, so you don't need to remember who is up.",
      href: "/pos/checkout",
      cta: "Open Checkout",
      done: sales > 0,
      found: sales ? plural(sales, "sale") : null,
    },
    {
      id: "booking",
      title: "Take a booking",
      why: "Bookings hold a therapist and bed for later. A deposit stays separate from sales until the guest comes.",
      how: ["Open Appointments on the POS.", "Add the guest, the time, and each massage.", "Take a deposit if you ask for one."],
      tip: "Send guests your booking page link so they can book themselves.",
      href: "/pos/appointments",
      cta: "Open Appointments",
      done: bookings > 0,
      found: bookings ? plural(bookings, "booking") : null,
    },
    {
      id: "expense",
      title: "Record an expense",
      why: "Expenses come off profit, and cash paid from the drawer comes off the cash to send.",
      how: ["Open Expenses on the POS.", "Type the amount, pick “Cash from drawer”, choose a category."],
      tip: "Add a new category or vendor straight from the dropdown. You don't need to leave the page.",
      href: "/pos/expenses",
      cta: "Open Expenses",
      done: expenses > 0,
      found: expenses ? plural(expenses, "expense") : null,
    },
    {
      id: "close",
      title: "Close the day",
      why: "Counting the drawer shows any cash difference and gives you the day's report.",
      how: ["Open Drawer on the POS.", "Count the cash by note and coin.", "Close the drawer and read the report."],
      tip: "“Cash to send” on the report is what leaves the shop. The float stays in the drawer for tomorrow.",
      href: "/pos/drawer",
      cta: "Open Drawer",
      done: closedDrawers > 0,
      found: closedDrawers ? plural(closedDrawers, "day") + " closed" : null,
    },
  ];
}
