import Link from "next/link";
import { getTherapistEarnings, resolveRange } from "@/lib/admin/therapist-earnings";
import { EarningsRange } from "@/components/admin/earnings-range";
import { formatCents } from "@/lib/utils";

const hours = (minutes: number) => (minutes / 60).toLocaleString("en-US", { maximumFractionDigits: 1 });

export default async function TherapistsPage({ searchParams }: PageProps<"/admin/therapists">) {
  const range = resolveRange(await searchParams);
  const { summaries } = await getTherapistEarnings(range);
  const query = range.key === "custom" ? `from=${range.from}&to=${range.to}` : `range=${range.key}`;
  const total = summaries.reduce(
    (t, s) => ({
      jobs: t.jobs + s.jobs,
      minutes: t.minutes + s.minutes,
      sale: t.sale + s.saleCents,
      pay: t.pay + s.payoutCents,
      transport: t.transport + s.transportCents,
    }),
    { jobs: 0, minutes: 0, sale: 0, pay: 0, transport: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Therapists</h1>
        <p className="text-muted-foreground">
          What each therapist brought in and earned. Open one to see their massages and the screen they see when they sign in.
        </p>
      </div>

      <EarningsRange basePath="/admin/therapists" active={range.key} from={range.from} to={range.to} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Massages", value: String(total.jobs), sub: `${hours(total.minutes)} hours` },
          { label: "Sales from massages", value: formatCents(total.sale), sub: range.label },
          { label: "Therapist pay (ค่ามือ)", value: formatCents(total.pay), sub: "before guarantee top-ups" },
          { label: "Transport paid", value: formatCents(total.transport), sub: "from the drawer" },
        ].map((b) => (
          <div key={b.label} className="rounded-[18px] bg-card p-4 ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
            <p className="text-xs font-medium text-muted-foreground">{b.label}</p>
            <p className="font-display mt-1 text-2xl tabular-nums">{b.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{b.sub}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[18px] bg-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Therapist</th>
              <th className="px-4 py-2.5 text-right font-medium">Massages</th>
              <th className="px-4 py-2.5 text-right font-medium">Hours</th>
              <th className="px-4 py-2.5 text-right font-medium">Sales</th>
              <th className="px-4 py-2.5 text-right font-medium">Their pay</th>
              <th className="px-4 py-2.5 text-right font-medium">Transport</th>
              <th className="px-4 py-2.5 text-right font-medium">Shop keeps</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {summaries.map((s) => (
              <tr key={s.staffId}>
                <td className="px-4 py-3">
                  <Link href={`/admin/therapists/${s.staffId}?${query}`} className="font-medium hover:underline" data-no-translate>
                    {s.name}
                  </Link>
                  <p className="text-xs text-muted-foreground" data-no-translate>
                    {s.branches.join(", ")}
                  </p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{s.jobs}</td>
                <td className="px-4 py-3 text-right tabular-nums">{hours(s.minutes)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCents(s.saleCents)}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCents(s.payoutCents)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {s.transportCents ? formatCents(s.transportCents) : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCents(s.saleCents - s.payoutCents - s.transportCents)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/therapists/${s.staffId}?${query}`}
                    className="whitespace-nowrap rounded-full bg-muted px-3 py-1.5 text-xs hover:bg-secondary"
                  >
                    Open their view
                  </Link>
                </td>
              </tr>
            ))}
            {summaries.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  No therapists set up yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Counted by when each massage finished, the same as Payroll. Sales are after discounts. Guarantee top-ups, bonuses and
        deductions are on the Payroll page.
      </p>
    </div>
  );
}
