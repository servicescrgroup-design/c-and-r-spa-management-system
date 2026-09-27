import { depositMethodLabel } from "@/lib/deposits/shared";
import { DepositCardActions } from "@/components/deposit-card-actions";
import { formatCents } from "@/lib/utils";

export type DepositCard = {
  card_no: string;
  status: string;
  start_at: string;
  end_at: string;
  timezone: string;
  customer_name: string;
  customer_phone: string | null;
  branch_name: string;
  branch_address: string | null;
  branch_phone: string | null;
  branch_map_url: string | null;
  services: { name: string; duration_minutes: number }[];
  therapist: string | null;
  total_cents: number;
  discount_cents: number;
  deposit_status: string;
  deposit_cents: number;
  deposit_method: string | null;
  deposit_paid_at: string | null;
  deposit_received_by: string | null;
  deposit_note: string | null;
};

function fmt(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...opts }).format(new Date(iso));
}

export function DepositCardView({ card }: { card: DepositCard }) {
  const tz = card.timezone || "Asia/Bangkok";
  const net = Math.max(card.total_cents - card.discount_cents, 0);
  const paid = card.deposit_status === "paid" && card.deposit_cents > 0;
  const balance = Math.max(net - (paid ? card.deposit_cents : 0), 0);
  const totalMinutes = Math.round((new Date(card.end_at).getTime() - new Date(card.start_at).getTime()) / 60_000);
  const cancelled = card.status === "cancelled" || card.status === "no_show";

  const summary = [
    `C&R Thai Massage deposit card ${card.card_no}`,
    `${fmt(card.start_at, tz, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} at ${fmt(card.start_at, tz, { hour: "2-digit", minute: "2-digit", hour12: false })}`,
    card.branch_name,
    paid ? `Deposit paid: ${formatCents(card.deposit_cents)}` : "Deposit: not paid",
    `Balance due: ${formatCents(balance)}`,
  ].join("\n");

  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 py-8 text-[#1d1d1f] print:bg-white print:p-0">
      <div className="mx-auto max-w-md space-y-4">
        <article className="relative overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-black/[0.06] print:shadow-none print:ring-black/20">
          <header className="bg-[#1f7a35] px-6 py-5 text-white print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">
            <p className="text-xs uppercase tracking-[0.2em] opacity-80">C&amp;R Thai Massage</p>
            <h1 className="font-display mt-1 text-2xl font-semibold">Deposit card</h1>
            <p className="mt-1 font-mono text-sm opacity-90" data-no-translate>
              {card.card_no}
            </p>
          </header>

          {paid && (
            <div
              className="absolute right-5 top-20 rotate-[-8deg] rounded-lg border-2 border-[#1f7a35] bg-white/90 px-3 py-1.5 text-center text-[#1f7a35]"
              aria-label="Paid stamp"
            >
              <p className="text-lg font-bold leading-none tracking-widest">PAID</p>
              <p className="mt-1 text-[10px] font-medium">
                {fmt(card.deposit_paid_at ?? card.start_at, tz, { day: "numeric", month: "short", year: "numeric" })}
              </p>
              <p className="text-[10px]">
                {fmt(card.deposit_paid_at ?? card.start_at, tz, { hour: "2-digit", minute: "2-digit", hour12: false })}
              </p>
            </div>
          )}

          <div className="space-y-5 px-6 py-5">
            {cancelled && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                This appointment was cancelled.
              </p>
            )}

            <section>
              <p className="text-xs uppercase tracking-wide text-[#6e6e73]">Guest</p>
              <p className="text-lg font-medium" data-no-translate>
                {card.customer_name || "Guest"}
              </p>
              {card.customer_phone && (
                <p className="text-sm text-[#6e6e73]" data-no-translate>
                  {card.customer_phone}
                </p>
              )}
            </section>

            <section className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[#6e6e73]">Appointment</p>
                <p className="font-medium">
                  {fmt(card.start_at, tz, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                </p>
                <p className="text-sm">
                  {fmt(card.start_at, tz, { hour: "2-digit", minute: "2-digit", hour12: false })} to{" "}
                  {fmt(card.end_at, tz, { hour: "2-digit", minute: "2-digit", hour12: false })} ({totalMinutes} min)
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[#6e6e73]">Store</p>
                <p className="font-medium" data-no-translate>
                  {card.branch_name}
                </p>
                {card.branch_address && <p className="text-sm text-[#6e6e73]">{card.branch_address}</p>}
                {card.branch_phone && <p className="text-sm text-[#6e6e73]">{card.branch_phone}</p>}
              </div>
            </section>

            <section>
              <p className="text-xs uppercase tracking-wide text-[#6e6e73]">Treatment</p>
              <ul className="mt-1 space-y-0.5">
                {card.services.map((s, i) => (
                  <li key={i} className="flex justify-between gap-3 text-sm">
                    <span data-no-translate>{s.name}</span>
                    <span className="shrink-0 text-[#6e6e73]">{s.duration_minutes} min</span>
                  </li>
                ))}
              </ul>
              {card.therapist && (
                <p className="mt-1 text-sm text-[#6e6e73]">
                  Therapist: <span data-no-translate>{card.therapist}</span>
                </p>
              )}
            </section>

            <section className="space-y-1.5 border-t border-dashed border-black/15 pt-4 text-sm">
              <div className="flex justify-between">
                <span>Booking total</span>
                <span>{formatCents(card.total_cents)}</span>
              </div>
              {card.discount_cents > 0 && (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>-{formatCents(card.discount_cents)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Deposit paid</span>
                <span className="font-medium text-[#1f7a35]">{paid ? `-${formatCents(card.deposit_cents)}` : formatCents(0)}</span>
              </div>
              <div className="flex justify-between border-t border-black/10 pt-2 text-base font-semibold">
                <span>Balance due at the appointment</span>
                <span>{formatCents(balance)}</span>
              </div>
            </section>

            {paid && (
              <section className="rounded-xl bg-[#f5f5f7] p-3 text-sm print:border print:border-black/15">
                <p className="text-xs uppercase tracking-wide text-[#6e6e73]">Deposit payment</p>
                <p>
                  {formatCents(card.deposit_cents)} by {depositMethodLabel(card.deposit_method)}
                </p>
                {card.deposit_paid_at && (
                  <p>
                    Paid on{" "}
                    {fmt(card.deposit_paid_at, tz, { day: "numeric", month: "short", year: "numeric" })} at{" "}
                    {fmt(card.deposit_paid_at, tz, { hour: "2-digit", minute: "2-digit", hour12: false })}
                  </p>
                )}
                {card.deposit_received_by && (
                  <p>
                    Received by <span data-no-translate>{card.deposit_received_by}</span>
                  </p>
                )}
                {card.deposit_note && <p className="text-[#6e6e73]">{card.deposit_note}</p>}
              </section>
            )}

            <p className="text-xs text-[#6e6e73]">
              Please show this card when you arrive. The deposit is deducted from your bill on the day.
            </p>
          </div>
        </article>

        <DepositCardActions summary={summary} mapUrl={card.branch_map_url} />
      </div>
    </main>
  );
}
