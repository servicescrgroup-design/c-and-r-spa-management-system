import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { signOutStaff } from "@/lib/auth/actions";
import { ViewSwitcher } from "@/components/view-switcher";

export default async function PosLayout({ children }: LayoutProps<"/pos">) {
  const ctx = await requireStaffContext();
  if (!ctx.roles.some((r) => r.role === "owner" || r.role === "manager" || r.role === "front_desk")) {
    redirect("/therapist");
  }

  const canAccessAdmin = ctx.roles.some((r) => r.role === "owner" || r.role === "manager");

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:gap-6 sm:px-6">
        <div className="flex items-center gap-4 sm:gap-6">
          <p className="text-sm font-semibold">C&amp;R Point of Sale</p>
          <nav className="flex gap-3 overflow-x-auto text-sm text-muted-foreground sm:gap-4">
            <Link href="/pos/register" className="shrink-0 hover:text-foreground">
              Register
            </Link>
            <Link href="/pos/queue" className="shrink-0 hover:text-foreground">
              Queue
            </Link>
            <Link href="/pos/sale" className="shrink-0 hover:text-foreground">
              New sale
            </Link>
            <Link href="/pos/refunds" className="shrink-0 hover:text-foreground">
              Refunds
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <form action={signOutStaff} className="flex items-center">
            <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
              <span className="hidden sm:inline">{ctx.firstName || ctx.email} &middot; </span>Sign out
            </button>
          </form>
          <ViewSwitcher canAccessAdmin={canAccessAdmin} canAccessPos />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
