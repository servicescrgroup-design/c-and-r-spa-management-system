import { requireStaffContext } from "@/lib/auth/session";
import { signOutStaff } from "@/lib/auth/actions";
import { ViewSwitcher } from "@/components/view-switcher";

export default async function TherapistLayout({ children }: LayoutProps<"/therapist">) {
  const ctx = await requireStaffContext();
  const canAccessAdmin = ctx.roles.some((r) => r.role === "owner" || r.role === "manager");

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-secondary/30">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-3.5 backdrop-blur">
        <p className="text-sm font-semibold">C&amp;R Team</p>
        <div className="flex items-center gap-2">
          <form action={signOutStaff}>
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {ctx.firstName || ctx.email} &middot; Sign out
            </button>
          </form>
          {canAccessAdmin && <ViewSwitcher canAccessAdmin canAccessPos />}
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
