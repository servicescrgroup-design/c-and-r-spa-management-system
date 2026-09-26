import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { signOutStaff } from "@/lib/auth/actions";
import { AdminSearch } from "@/components/admin/admin-search";
import { ViewSwitcher } from "@/components/view-switcher";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/branches", label: "Branches" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/scheduling", label: "Scheduling" },
  { href: "/admin/registers", label: "Registers" },
  { href: "/admin/payroll", label: "Payroll" },
  { href: "/admin/accounting", label: "Accounting" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await requireStaffContext();
  if (!ctx.roles.some((r) => r.role === "owner" || r.role === "manager")) {
    redirect(ctx.roles.some((r) => r.role === "front_desk") ? "/pos" : "/therapist");
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col sm:flex-row">
      {/* Mobile top bar: the sidebar below is hidden under `sm`, so this is the
       * only way to sign out or reach settings on a phone-width screen. */}
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:hidden">
        <p className="text-sm font-semibold">C&amp;R Back Office</p>
        <div className="flex items-center gap-3">
          <ViewSwitcher canAccessAdmin canAccessPos />
          <Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
            Settings
          </Link>
          <form action={signOutStaff}>
            <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="border-b border-border bg-card px-4 py-2 sm:hidden">
        <AdminSearch />
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 sm:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>

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
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="hidden items-center justify-between gap-4 border-b border-border bg-card px-6 py-2.5 sm:flex">
          <AdminSearch />
          <ViewSwitcher canAccessAdmin canAccessPos />
        </div>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
