import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = {
  title: "Sign up · HB Spa Management System",
};

const PREPARE = [
  { title: "Business and store names", body: "The name guests know you by, and a name for each store, e.g. “Old Town” and “Night Bazaar”." },
  { title: "Opening hours", body: "Per store. Payroll uses closing time to tell an early clock-out from a full day." },
  { title: "Your massage menu", body: "Each massage with its lengths and prices, e.g. Thai 60 min ฿300, 90 min ฿450, plus what the therapist earns for each." },
  { title: "Rooms and beds", body: "How many rooms, and the beds or chairs in each, so bookings don't land on a taken bed." },
  { title: "Your staff list", body: "Name and email for each therapist, front desk and manager. You can create their logins yourself." },
  { title: "Cash float", body: "How much change stays in the drawer overnight, e.g. ฿2,000. It is kept out of the cash to send." },
];

export default function SignupPage() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <header className="glass-bar sticky top-0 z-40 border-b border-black/5 dark:border-white/10">
        <nav className="mx-auto flex h-12 max-w-[1024px] items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            HB <span className="font-normal text-muted-foreground">Spa Management System</span>
          </Link>
          <Link href="/auth/staff-login" className="text-[13px] text-foreground/80 hover:text-foreground">
            Log in
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-20">
        <h1 className="font-display text-4xl sm:text-5xl">Create your business account</h1>
        <div className="mt-6 rounded-2xl bg-primary/10 p-5 text-[15px]">
          <p className="font-medium">Self sign-up is opening soon.</p>
          <p className="mt-1 text-muted-foreground">
            We&apos;re finishing the step that keeps every business&apos;s sales, staff and customers private to that
            business. Until then, new businesses are set up by the HB team. Get the list below ready and it takes about
            20 minutes to go live.
          </p>
        </div>

        <h2 className="mt-12 text-2xl font-semibold">What to have ready</h2>
        <ul className="mt-5 space-y-4">
          {PREPARE.map((p) => (
            <li key={p.title} className="flex gap-3">
              <span aria-hidden className="mt-1 size-4 shrink-0 rounded border-2 border-primary/50" />
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-[15px] text-muted-foreground">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link href="/auth/staff-login" className={buttonVariants({ size: "lg" })}>
            I already have a login
          </Link>
          <Link href="/" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Back
          </Link>
        </div>
      </div>
    </main>
  );
}
