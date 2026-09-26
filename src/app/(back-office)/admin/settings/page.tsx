import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { getOrganization } from "@/lib/admin/org-actions";
import { OrgSettingsForm } from "@/components/admin/org-settings-form";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { RoleCapabilitiesCard } from "@/components/admin/role-capabilities-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const QUICK_LINKS = [
  { href: "/admin/branches", title: "Branches", description: "Locations, hours, and service availability." },
  { href: "/admin/staff", title: "Staff & roles", description: "Accounts, permissions, and deposits." },
  { href: "/admin/services", title: "Services & categories", description: "Catalogue, pricing, and bed types." },
  { href: "/admin/inventory", title: "Inventory", description: "Stock levels and retail products." },
  { href: "/admin/scheduling", title: "Scheduling", description: "Rooms, beds, and appointments." },
  { href: "/admin/payroll", title: "Payroll", description: "Pay periods and exports." },
  { href: "/admin/accounting", title: "Accounting", description: "Chart of accounts and journal entries." },
  { href: "/admin/reports", title: "Reports", description: "Cross-branch performance." },
];

export default async function SettingsPage() {
  const ctx = await requireStaffContext();
  const org = await getOrganization();
  if (!org) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage the organization and jump to any part of the back office.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
          <CardDescription>Everything you can control from the back office.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl border border-border p-3 transition-colors hover:border-primary hover:bg-muted/40"
              >
                <p className="text-sm font-medium">{link.title}</p>
                <p className="text-xs text-muted-foreground">{link.description}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {isOwner(ctx) ? (
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Business name, currency, and timezone used across the whole system.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrgSettingsForm org={org} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Only an owner can change these. Ask an owner if something needs updating.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Business name:</span> {org.name}</p>
            <p><span className="text-muted-foreground">Currency:</span> {org.currency}</p>
            <p><span className="text-muted-foreground">Timezone:</span> {org.timezone}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>Signed in as {ctx.email}.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <RoleCapabilitiesCard />
    </div>
  );
}
