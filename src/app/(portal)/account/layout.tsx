import Link from "next/link";
import { requireCustomerId } from "@/lib/auth/session";

const NAV = [
  { href: "/account", label: "Overview" },
  { href: "/account/appointments", label: "Appointments" },
  { href: "/account/packages", label: "Packages & gift cards" },
  { href: "/account/profile", label: "Profile" },
];

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  await requireCustomerId();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <nav className="flex flex-wrap gap-2 border-b border-border pb-4">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
