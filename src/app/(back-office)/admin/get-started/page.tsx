import Link from "next/link";
import { requireStaffContext } from "@/lib/auth/session";
import { getSetupProgress } from "@/lib/admin/setup-progress";
import { TryItChecklist } from "@/components/admin/try-it-checklist";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Get started · HB Spa Management System" };

const TIPS = [
  {
    title: "A normal day",
    lines: [
      "Morning: open the drawer with the float, therapists check in, tick the opening checklist.",
      "During the day: checkout from the queue, #1 is next. Record expenses as they happen.",
      "2pm: someone checks the morning checklist and signs it off.",
      "Night: count the drawer, close it, send the “Cash to send” amount.",
    ],
  },
  {
    title: "Who sees what",
    lines: [
      "Owner: everything, every store.",
      "Admin (Backend Team): runs their own store, including the menu, therapist profiles and payroll adjustments.",
      "Front desk: the POS only. Sell, book, record expenses, close the drawer.",
      "Therapist: their own jobs and pay, in Thai.",
    ],
  },
  {
    title: "Mistakes are fixable",
    lines: [
      "Wrong therapist or price on a bill: open it on Sales and edit it.",
      "Forgot to pick a therapist: open the bill on Sales and use “Choose therapist”.",
      "Test sales: delete them on Sales before payroll is locked for that day.",
      "Deposit entered by mistake: remove it from the booking before it is used.",
    ],
  },
  {
    title: "Shortcuts",
    lines: [
      "The magnifier at the top searches every back-office page.",
      "Owners can sell at another store without closing their shift: tap “Sell” next to that store at the top of the POS.",
      "The start time field takes 24-hour times like 1530, or 3:30pm.",
      "Add an expense category or vendor straight from its dropdown.",
    ],
  },
];

export default async function GetStartedPage() {
  await requireStaffContext();
  const steps = await getSetupProgress();
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="font-display text-3xl">Get started</h1>
        <p className="mt-1 text-muted-foreground">
          Set up your store in order. Each step ticks itself off once the system sees it done.
        </p>
      </div>

      <div className="rounded-2xl bg-muted/60 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-lg font-semibold">
            {doneCount === steps.length ? "You're set up." : `${doneCount} of ${steps.length} steps done`}
          </p>
          {next && (
            <Link href={next.href} className={buttonVariants({ size: "sm" })}>
              Next: {next.title}
            </Link>
          )}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={step.id}>
              <details
                open={step.id === next?.id}
                className={cn(
                  "group rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.08]",
                  step.done && "opacity-80",
                )}
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      step.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {step.done ? "✓" : i + 1}
                  </span>
                  <span className="flex-1">
                    <span className={cn("font-medium", step.done && "text-muted-foreground")}>{step.title}</span>
                    {step.found && <span className="block text-xs text-muted-foreground">Found: {step.found}</span>}
                  </span>
                  <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
                </summary>
                <div className="space-y-3 px-4 pb-4 pl-14 text-[15px]">
                  <p className="text-muted-foreground">{step.why}</p>
                  <ol className="list-decimal space-y-1 pl-5">
                    {step.how.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ol>
                  <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm">
                    <span className="font-medium">Tip: </span>
                    {step.tip}
                  </p>
                  <Link href={step.href} className={buttonVariants({ size: "sm", variant: step.done ? "outline" : "default" })}>
                    {step.cta}
                  </Link>
                </div>
              </details>
            </li>
          ))}
        </ol>

        <aside className="space-y-4">
          <TryItChecklist />
        </aside>
      </div>

      <section>
        <h2 className="text-2xl font-semibold">Tips and tricks</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {TIPS.map((t) => (
            <div key={t.title} className="rounded-2xl bg-card p-5 ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
              <p className="font-semibold">{t.title}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-muted-foreground">
                {t.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
