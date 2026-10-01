import { HbHeader } from "@/components/hb-header";
import { BusinessSignupForm } from "@/components/auth/business-signup-form";

export const metadata = {
  title: "Sign up · HB Spa Management System",
};

const PREPARE = [
  { title: "Opening hours", body: "Per store. Payroll uses closing time to tell an early clock-out from a full day." },
  { title: "Your massage menu", body: "Each massage with its lengths and prices, e.g. Thai 60 min ฿300, 90 min ฿450, plus what the therapist earns for each." },
  { title: "Rooms and beds", body: "How many rooms, and the beds or chairs in each, so bookings don't land on a taken bed." },
  { title: "Your staff list", body: "Name and email for each therapist, front desk and manager. You can create their logins yourself." },
  { title: "Cash float", body: "How much change stays in the drawer overnight, e.g. ฿2,000. It is kept out of the cash to send." },
];

export default function SignupPage() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <HbHeader showSignup={false} />
      <div className="mx-auto grid w-full max-w-5xl gap-12 px-6 py-12 sm:py-16 lg:grid-cols-[1fr_380px]">
        <div className="order-2 lg:order-1">
          <h2 className="text-2xl font-semibold">After you sign up</h2>
          <p className="mt-2 text-muted-foreground">
            The Get started page walks you through setup and ticks each step off. These are worth having ready:
          </p>
          <ul className="mt-6 space-y-4">
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
        </div>
        <div className="order-1 lg:order-2">
          <h1 className="font-display text-4xl">Create your business account</h1>
          <p className="mt-2 text-muted-foreground">About 2 minutes. Your business gets its own private space.</p>
          <div className="mt-6 rounded-2xl bg-card p-6 ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
            <BusinessSignupForm />
          </div>
        </div>
      </div>
    </main>
  );
}
