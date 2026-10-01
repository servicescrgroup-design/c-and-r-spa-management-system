import Link from "next/link";

/** Top bar for HB Spa Management System's own pages (not a shop's booking page). */
export function HbHeader({ showSignup = true }: { showSignup?: boolean }) {
  return (
    <header className="glass-bar sticky top-0 z-40 border-b border-black/5 dark:border-white/10">
      <nav className="mx-auto flex h-12 max-w-[1024px] items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="text-[15px] font-semibold tracking-tight">
          HB <span className="font-normal text-muted-foreground">Spa Management System</span>
        </Link>
        <div className="flex items-center gap-5 text-[13px] text-foreground/80 sm:gap-7">
          <Link href="/auth/staff-login" className="hover:text-foreground">
            Log in
          </Link>
          {showSignup && (
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
