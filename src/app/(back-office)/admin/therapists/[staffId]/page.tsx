import Link from "next/link";
import { notFound } from "next/navigation";
import { getTherapistEarnings, resolveRange } from "@/lib/admin/therapist-earnings";
import { getTherapistPortalDataFor } from "@/lib/therapist/portal-data";
import { EarningsRange } from "@/components/admin/earnings-range";
import { TherapistPortalView } from "@/components/therapist/therapist-portal-view";
import { formatCents } from "@/lib/utils";

const hours = (minutes: number) => (minutes / 60).toLocaleString("en-US", { maximumFractionDigits: 1 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export default async function TherapistDetailPage({ params, searchParams }: PageProps<"/admin/therapists/[staffId]">) {
  const { staffId } = await params;
  const range = resolveRange(await searchParams);
  const [portal, { summaries, jobs }] = await Promise.all([
    getTherapistPortalDataFor(staffId),
    getTherapistEarnings(range, staffId),
  ]);
  const summary = summaries[0];
  if (!portal || !summary) notFound();
  const keeps = summary.saleCents - summary.payoutCents - summary.transportCents;

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/admin/therapists${range.key === "custom" ? `?from=${range.from}&to=${range.to}` : `?range=${range.key}`}`} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; All therapists
        </Link>
        <h1 className="font-display mt-1 text-3xl font-medium tracking-tight" data-no-translate>
          {summary.name}
        </h1>
        <p className="text-muted-foreground">
          <span data-no-translate>{summary.branches.join(", ")}</span> ·{" "}
          <Link href={`/admin/staff/${staffId}`} className="text-accent hover:underline">
            Staff profile
          </Link>
        </p>
      </div>

      <section className="space-y-4">
        <EarningsRange basePath={`/admin/therapists/${staffId}`} active={range.key} from={range.from} to={range.to} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Massages", value: String(summary.jobs), sub: `${hours(summary.minutes)} hours` },
            { label: "Sales they brought in", value: formatCents(summary.saleCents), sub: range.label },
            { label: "Their pay (ค่ามือ)", value: formatCents(summary.payoutCents), sub: "before guarantee top-ups" },
            {
              label: "Shop keeps",
              value: formatCents(keeps),
              sub: summary.transportCents ? `after ${formatCents(summary.transportCents)} transport` : "sales minus their pay",
            },
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
                <th className="px-4 py-2.5 font-medium">Finished</th>
                <th className="px-4 py-2.5 font-medium">Massage</th>
                <th className="px-4 py-2.5 font-medium">Bill</th>
                <th className="px-4 py-2.5 text-right font-medium">Customer paid</th>
                <th className="px-4 py-2.5 text-right font-medium">Their pay</th>
                <th className="px-4 py-2.5 text-right font-medium">Transport</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((j) => (
                <tr key={j.id} className={j.isAddOn ? "text-muted-foreground" : undefined}>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{when(j.completedAt)}</td>
                  <td className="px-4 py-2.5">
                    <span data-no-translate>
                      {j.isAddOn ? "+ " : ""}
                      {j.description}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      <span data-no-translate>{j.branchName}</span>
                      {j.guestName && (
                        <>
                          {" · "}
                          <span data-no-translate>{j.guestName}</span>
                        </>
                      )}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{j.saleRef ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCents(j.saleCents)}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCents(j.payoutCents)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{j.transportCents ? formatCents(j.transportCents) : "—"}</td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    No finished massages in this period.
                  </td>
                </tr>
              )}
            </tbody>
            {jobs.length > 0 && (
              <tfoot className="border-t border-border font-semibold">
                <tr>
                  <td className="px-4 py-2.5" colSpan={3}>
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCents(summary.saleCents)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCents(summary.payoutCents)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCents(summary.transportCents)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Their screen</h2>
          <p className="text-sm text-muted-foreground">
            What <span data-no-translate>{summary.name}</span> sees at /therapist. Their screen always shows today and this week.
          </p>
        </div>
        <div className="mx-auto max-w-2xl rounded-[28px] bg-muted/40 p-4 ring-1 ring-border sm:p-6">
          <TherapistPortalView data={portal} viewer="owner" />
        </div>
      </section>
    </div>
  );
}
