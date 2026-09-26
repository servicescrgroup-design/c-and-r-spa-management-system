import { requireStaffContext } from "@/lib/auth/session";
import { signOutStaff } from "@/lib/auth/actions";

export default async function TherapistLayout({ children }: LayoutProps<"/therapist">) {
  const ctx = await requireStaffContext();

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <p className="text-sm font-semibold">My schedule &amp; pay</p>
        <form action={signOutStaff}>
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            {ctx.firstName || ctx.email} &middot; Sign out
          </button>
        </form>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
