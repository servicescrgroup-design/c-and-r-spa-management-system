import Link from "next/link";

/** Thin frosted bar for customer-facing pages, in the style of apple.com. */
export function PublicNav() {
  return (
    <header className="glass-bar sticky top-0 z-40 border-b border-black/5 dark:border-white/10">
      <nav className="mx-auto flex h-12 max-w-[1024px] items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="text-[15px] font-semibold tracking-tight">
          C&amp;R Thai Massage
        </Link>
        <div className="flex items-center gap-5 text-[13px] text-foreground/80 sm:gap-7">
          <Link href="/book" className="hover:text-foreground">
            Book
          </Link>
          <Link href="/auth/customer-login" className="hover:text-foreground">
            Sign in
          </Link>
          <Link href="/auth/staff-login" className="hidden hover:text-foreground sm:inline">
            Staff
          </Link>
        </div>
      </nav>
    </header>
  );
}
