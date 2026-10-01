import Link from "next/link";

type Business = { name: string; slug: string };

const DEFAULT_BUSINESS: Business = { name: "C&R Thai Massage", slug: "candr" };

/**
 * Thin frosted bar for a business's customer-facing pages, in the style of
 * apple.com. The booking variant only offers booking; sign in and account
 * pages live on their own.
 */
export function PublicNav({
  variant = "account",
  business = DEFAULT_BUSINESS,
}: {
  variant?: "booking" | "account";
  business?: Business;
}) {
  const bookHref = `/b/${business.slug}`;
  return (
    <header className="glass-bar sticky top-0 z-40 border-b border-black/5 dark:border-white/10">
      <nav className="mx-auto flex h-12 max-w-[1024px] items-center justify-between gap-6 px-4 sm:px-6">
        <Link href={bookHref} className="text-[15px] font-semibold tracking-tight" data-no-translate>
          {business.name}
        </Link>
        <div className="flex items-center gap-5 text-[13px] text-foreground/80 sm:gap-7">
          <Link href={bookHref} className="hover:text-foreground">
            Book
          </Link>
          {variant === "account" && (
            <Link href="/auth/customer-login" className="hover:text-foreground">
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
