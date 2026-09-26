import Link from "next/link";
import { requireCustomerId } from "@/lib/auth/session";
import { signOutCustomer } from "@/lib/auth/actions";
import { PublicNav } from "@/components/public-nav";

const NAV = [
  { href: "/account", label: "Overview" },
  { href: "/account/appointments", label: "Appointments" },
  { href: "/account/packages", label: "Packages & gift cards" },
  { href: "/account/profile", label: "Profile" },
];

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  await requireCustomerId();

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <PublicNav />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-full bg-muted p-0.5">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-1.5 text-[13px] text-foreground/80 transition-colors hover:bg-card hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <form action={signOutCustomer}>
            <button type="submit" className="text-[13px] text-accent hover:underline">
              Sign out
            </button>
          </form>
        </nav>
        {children}
      </div>
    </div>
  );
}
