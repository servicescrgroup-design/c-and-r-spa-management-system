import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";
import type { ReceptionistPayrollSummary } from "@/lib/admin/receptionist-payroll-actions";

export function ReceptionistPayrollBoard({ summary }: { summary: ReceptionistPayrollSummary }) {
  const goalHit = summary.storeRevenueCents >= summary.commissionThresholdCents;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Team commission goal</CardTitle>
          <CardDescription>
            Both branches combined must clear {formatCents(summary.commissionThresholdCents)} in this period before any
            commission opens up — then 10% of the amount over that goal is split among receptionists by how much
            revenue they personally rang up.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">Store revenue (both branches)</p>
            <p className="font-display mt-1 text-xl">{formatCents(summary.storeRevenueCents)}</p>
          </div>
          <div className={cn("rounded-xl p-3", goalHit ? "bg-primary/10" : "bg-muted/40")}>
            <p className="text-xs font-medium text-muted-foreground">
              {goalHit ? "Over goal by" : "Still needed to hit goal"}
            </p>
            <p className={cn("font-display mt-1 text-xl", goalHit && "text-primary")}>
              {formatCents(Math.abs(summary.storeRevenueCents - summary.commissionThresholdCents))}
            </p>
          </div>
          <div className="rounded-xl bg-highlight/10 p-3">
            <p className="text-xs font-medium text-muted-foreground">Commission pool (10% of overage)</p>
            <p className="font-display mt-1 text-xl">{formatCents(summary.commissionPoolCents)}</p>
          </div>
        </CardContent>
      </Card>

      {summary.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No front-desk staff assigned yet.</p>
      ) : (
        summary.rows.map((row) => (
          <Card key={row.staffId}>
            <CardHeader>
              <CardTitle>{row.name}</CardTitle>
              <CardDescription>
                {row.certificationCount} approved certification{row.certificationCount === 1 ? "" : "s"} &middot; base pay{" "}
                {formatCents(row.basePayCents)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Base pay</p>
                  <p className="font-display mt-1 text-lg">{formatCents(row.basePayCents)}</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Commission</p>
                  <p className="font-display mt-1 text-lg">{formatCents(row.commissionCents)}</p>
                </div>
                <div className="rounded-xl bg-primary/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Total pay</p>
                  <p className="font-display mt-1 text-lg text-primary">{formatCents(row.totalPayCents)}</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Personal revenue rung up</p>
                  <p className="font-display mt-1 text-lg">{formatCents(row.personalRevenueCents)}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Total revenue:</span> {formatCents(row.totalRevenueCents)}
                </p>
                <p>
                  <span className="text-muted-foreground">Total cost:</span> {formatCents(row.totalCostCents)}
                </p>
                <p>
                  <span className="text-muted-foreground">Total profit:</span> {formatCents(row.totalProfitCents)}
                </p>
                <p>
                  <span className="text-muted-foreground">Appointments (booked):</span> {row.totalAppointments}
                </p>
                <p>
                  <span className="text-muted-foreground">Walk-ins:</span> {row.totalWalkIns}
                </p>
              </div>

              <div className="space-y-3">
                {row.branches.map((b) => (
                  <div key={b.branchId} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{b.branchName}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.appointmentCount} appointment{b.appointmentCount === 1 ? "" : "s"} &middot; {b.walkInCount} walk-in
                        {b.walkInCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <span>Revenue: {formatCents(b.revenueCents)}</span>
                      <span>Cost: {formatCents(b.costCents)}</span>
                      <span>Profit: {formatCents(b.profitCents)}</span>
                    </div>
                    {b.services.length > 0 && (
                      <ul className="mt-2 divide-y divide-border text-xs">
                        {b.services.map((s) => (
                          <li key={s.description} className="flex items-center justify-between py-1">
                            <span>
                              {s.description} &times;{s.count}
                            </span>
                            <span>{formatCents(s.revenueCents)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {row.branches.length === 0 && <p className="text-sm text-muted-foreground">No sales in this period.</p>}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
