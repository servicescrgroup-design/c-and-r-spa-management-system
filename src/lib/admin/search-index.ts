export type SearchItem = { label: string; href: string; keywords?: string };

/** A curated index of everywhere in the back office — including tabs and
 * sections nested inside a page — so the search bar can jump straight to
 * something buried a click or two deep instead of just top-level nav. */
export const SEARCH_INDEX: SearchItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Revenue by branch", href: "/admin", keywords: "chart revenue sales dashboard custom range" },

  { label: "Branches", href: "/admin/branches" },
  { label: "Branch opening hours", href: "/admin/branches", keywords: "hours schedule open close time" },
  { label: "Branch payroll & queue settings", href: "/admin/branches", keywords: "guarantee minimum hours transportation fee queue" },
  { label: "Branch therapists", href: "/admin/branches", keywords: "assign therapist to branch" },
  { label: "Branch service availability", href: "/admin/branches", keywords: "which services a branch offers" },
  { label: "Booking links", href: "/admin/branches", keywords: "book online link copy slug embed" },

  { label: "Registers", href: "/admin/registers", keywords: "cash till counter drawer" },

  { label: "Staff", href: "/admin/staff" },
  { label: "Therapists", href: "/admin/staff", keywords: "massage therapist list" },
  { label: "Front desk / receptionists", href: "/admin/staff", keywords: "reception cashier" },
  { label: "Invite staff", href: "/admin/staff", keywords: "add new staff member invite link" },
  { label: "Role capabilities", href: "/admin/staff", keywords: "owner manager front desk therapist permissions" },
  { label: "Edit staff login & password", href: "/admin/staff", keywords: "reset password email change" },
  { label: "Bulk password reset", href: "/admin/staff", keywords: "set password for selected therapists" },

  { label: "Services & categories", href: "/admin/services" },
  { label: "Categories", href: "/admin/services", keywords: "service categories table image color translation" },
  { label: "Category translations", href: "/admin/services", keywords: "thai chinese korean japanese language" },
  { label: "Service pricing & payout", href: "/admin/services", keywords: "duration price retail therapist share ค่ามือ" },
  { label: "Bed types", href: "/admin/services", keywords: "thai bed oil bed foot chair" },
  { label: "Combo pricing", href: "/admin/services", keywords: "combo package multiple services" },
  { label: "Products", href: "/admin/inventory", keywords: "retail products catalog" },

  { label: "Inventory", href: "/admin/inventory" },
  { label: "Add a product", href: "/admin/inventory", keywords: "starting stock unit sku" },
  { label: "Receive stock", href: "/admin/inventory", keywords: "log stock arriving branch" },
  { label: "Adjust stock", href: "/admin/inventory", keywords: "count correction damage transfer" },
  { label: "Stock list", href: "/admin/inventory", keywords: "on hand cost retail margin profit per branch" },
  { label: "Stock history", href: "/admin/inventory", keywords: "inventory adjustments edit delete log" },
  { label: "Which products a branch carries", href: "/admin/inventory", keywords: "carried override" },

  { label: "Scheduling", href: "/admin/scheduling" },
  { label: "Rooms & beds", href: "/admin/scheduling", keywords: "add room add bed foot chair oil thai" },
  { label: "Weekly schedule blocks", href: "/admin/scheduling", keywords: "add a schedule block multi select days branches" },
  { label: "Appointments", href: "/admin/scheduling", keywords: "book appointment upcoming" },

  { label: "Payroll — Therapists", href: "/admin/payroll?section=therapists", keywords: "guarantee hours payout" },
  { label: "Payroll — Receptionists", href: "/admin/payroll?section=receptionists", keywords: "base pay certification commission" },
  { label: "Payroll export", href: "/admin/payroll", keywords: "csv download" },
  { label: "Document expiry", href: "/admin/payroll", keywords: "expiring soon work permit health check" },

  { label: "Accounting", href: "/admin/accounting" },
  { label: "Chart of accounts", href: "/admin/accounting" },
  { label: "Journal entries", href: "/admin/accounting" },

  { label: "Reports", href: "/admin/reports" },

  { label: "Settings", href: "/admin/settings" },
  { label: "Organization / business name", href: "/admin/settings", keywords: "currency timezone" },
  { label: "Required documents", href: "/admin/settings", keywords: "completeness checklist national id work permit" },
  { label: "Specialties & certifications", href: "/admin/settings", keywords: "hot stone facial approve" },
  { label: "Change your password", href: "/admin/settings" },
];
