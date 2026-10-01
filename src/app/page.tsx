import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "HB Spa Management System",
  description: "Point of sale, therapist queue, bookings with deposits, payroll and daily reports for spas and massage shops.",
};

const FEATURES = [
  {
    title: "Checkout in a few taps",
    body: "Pick the massage, length and therapist. Split one group into separate bills, take cash, PromptPay or card, and print the receipt.",
  },
  {
    title: "A fair therapist queue",
    body: "Therapists check in, the queue shows who is next, and finishing a job puts them back in line. One queue can cover two stores.",
  },
  {
    title: "Bookings with deposits",
    body: "Book Guest 1, Guest 2 and their massages for later. Take a deposit, and it comes off the bill when they arrive. It is never counted as sales early.",
  },
  {
    title: "Payroll without a spreadsheet",
    body: "Therapist pay per massage, OT, transport and a daily guarantee are worked out from the bills. Lock a day once it's checked.",
  },
  {
    title: "Daily report and cash to send",
    body: "Close the drawer, count the cash, and see what to send after keeping the float. Sales, costs and profit per store, per day.",
  },
  {
    title: "Expenses and checklists",
    body: "Front desk records ice, towels and oil from the POS. Opening, 2pm and closing checklists show what was missed and by whom.",
  },
];

const STEPS = [
  { n: "1", title: "Create your business", body: "Your name, your first store and your login. About 2 minutes." },
  { n: "2", title: "Set up the store", body: "Opening hours, your massage menu with prices, rooms and beds, then add your staff." },
  { n: "3", title: "Open the drawer and sell", body: "Count the float, ring up the first walk-in, and close the day with the report." },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <header className="glass-bar sticky top-0 z-40 border-b border-black/5 dark:border-white/10">
        <nav className="mx-auto flex h-12 max-w-[1024px] items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            HB <span className="font-normal text-muted-foreground">Spa Management System</span>
          </Link>
          <div className="flex items-center gap-5 text-[13px] text-foreground/80 sm:gap-7">
            <Link href="/auth/staff-login" className="hover:text-foreground">
              Log in
            </Link>
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </nav>
      </header>

      <section className="px-6 pb-20 pt-16 text-center sm:pb-28 sm:pt-24">
        <p className="text-sm font-medium text-primary">For spas and massage shops</p>
        <h1 className="font-display mx-auto mt-3 max-w-3xl text-5xl sm:text-7xl">Run your spa from one screen.</h1>
        <p className="mx-auto mt-5 max-w-xl text-[17px] text-muted-foreground">
          Point of sale, therapist queue, bookings with deposits, payroll and daily reports. Built and used every day in a
          two-store Thai massage business in Chiang Mai.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Create your business account
          </Link>
          <Link href="/auth/staff-login" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Staff log in
          </Link>
        </div>
      </section>

      <section className="bg-muted/50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-[1024px]">
          <h2 className="font-display text-center text-4xl sm:text-5xl">What it does</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-[18px] bg-card p-6 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
                <p className="text-[17px] font-semibold">{f.title}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-[1024px]">
          <h2 className="font-display text-center text-4xl sm:text-5xl">Open for business in three steps</h2>
          <ol className="mt-12 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="text-center">
                <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary text-[17px] font-semibold text-primary-foreground">
                  {s.n}
                </span>
                <p className="mt-4 text-[17px] font-semibold">{s.title}</p>
                <p className="mt-1.5 text-[15px] text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-center text-[15px] text-muted-foreground">
            After you sign up, the <span className="font-medium text-foreground">Get started</span> page walks you through
            each step and ticks it off as you go.
          </p>
        </div>
      </section>

      <section className="bg-black px-6 py-20 text-center text-[#f5f5f7] sm:py-24">
        <h2 className="font-display text-4xl sm:text-5xl">Looking to book a massage?</h2>
        <p className="mx-auto mt-3 max-w-lg text-[17px] text-[#a1a1a6]">
          This page is for business owners. Guests book on the shop&apos;s own booking page.
        </p>
        <Link href="/book" className={cn("mt-8 inline-block text-[17px] text-[#30d158] hover:underline")}>
          Book at C&amp;R Thai Massage &rsaquo;
        </Link>
      </section>

      <footer className="border-t border-border px-6 py-6 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-[1024px] flex-wrap items-center justify-between gap-3">
          <p>HB Spa Management System</p>
          <div className="flex gap-5">
            <Link href="/auth/staff-login" className="hover:text-foreground">
              Staff log in
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
