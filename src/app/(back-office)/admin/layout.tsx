import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { signOutStaff } from "@/lib/auth/actions";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/branches", label: "Branches" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/scheduling", label: "Scheduling" },
  { href: "/admin/payroll", label: "Payroll" },
  { href: "/admin/accounting", label: "Accounting" },
  { href: "/admin/reports", label: "Reports" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await requireStaffContext();
  if (!ctx.roles.some((r) => r.role === "owner" || r.role === "manager" || r.role === "front_desk")) {
    redirect("/therapist");
  }

  return (
    <div className="flex min-h-svh flex-1">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card p-4 sm:block">
        <p className="mb-6 text-sm font-semibold">C&amp;R Back Office</p>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
          Signed in as {ctx.firstName || ctx.email}
          {isOwner(ctx) && <span className="ml-1 font-medium text-primary">(owner)</span>}
        </div>
        <form action={signOutStaff} className="mt-2">
          <button type="submit" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            Sign out
          </button>
        </form>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
