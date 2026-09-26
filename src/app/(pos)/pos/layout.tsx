import Link from "next/link";
import { requireStaffContext } from "@/lib/auth/session";
import { signOutStaff } from "@/lib/auth/actions";

export default async function PosLayout({ children }: LayoutProps<"/pos">) {
  const ctx = await requireStaffContext();

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="flex items-center justify-between gap-6 border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-6">
          <p className="text-sm font-semibold">C&amp;R Point of Sale</p>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/pos/register" className="hover:text-foreground">
              Register
            </Link>
            <Link href="/pos/queue" className="hover:text-foreground">
              Queue
            </Link>
            <Link href="/pos/sale" className="hover:text-foreground">
              New sale
            </Link>
            <Link href="/pos/refunds" className="hover:text-foreground">
              Refunds
            </Link>
          </nav>
        </div>
        <form action={signOutStaff} className="flex items-center">
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            {ctx.firstName || ctx.email} &middot; Sign out
          </button>
        </form>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
