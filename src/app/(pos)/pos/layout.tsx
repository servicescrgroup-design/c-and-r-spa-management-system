import Link from "next/link";
import { requireStaffContext } from "@/lib/auth/session";

export default async function PosLayout({ children }: LayoutProps<"/pos">) {
  await requireStaffContext();

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="flex items-center gap-6 border-b border-border bg-card px-6 py-3">
        <p className="text-sm font-semibold">C&amp;R Point of Sale</p>
        <nav className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/pos/register" className="hover:text-foreground">
            Register
          </Link>
          <Link href="/pos/queue" className="hover:text-foreground">
            Queue
          </Link>
          <Link href="/pos/refunds" className="hover:text-foreground">
            Refunds
          </Link>
        </nav>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
