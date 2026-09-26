import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { getOrganization, getRequiredDocumentTypes } from "@/lib/admin/org-actions";
import { getCertifications } from "@/lib/admin/certification-actions";
import { OrgSettingsForm } from "@/components/admin/org-settings-form";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { RoleCapabilitiesCard } from "@/components/admin/role-capabilities-card";
import { RequiredDocumentsForm } from "@/components/admin/required-documents-form";
import { CertificationsManager } from "@/components/admin/certifications-manager";
import { HomepageImagesCard } from "@/components/admin/homepage-images-card";
import { getSiteContent } from "@/lib/admin/site-content-actions";
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
  const [org, requiredDocTypes, certifications, siteContent] = await Promise.all([
    getOrganization(),
    getRequiredDocumentTypes(),
    getCertifications(),
    getSiteContent(),
  ]);
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

      <Card id="homepage">
        <CardHeader>
          <CardTitle>Homepage photos</CardTitle>
          <CardDescription>
            Background photos for your public homepage. Wide landscape photos work best (at least 2000 px wide).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HomepageImagesCard heroUrl={siteContent.hero_image_url} branchesUrl={siteContent.branches_image_url} />
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
          <CardTitle>Required documents</CardTitle>
          <CardDescription>What every therapist&apos;s Completeness checklist checks for.</CardDescription>
        </CardHeader>
        <CardContent>
          <RequiredDocumentsForm initialTypes={requiredDocTypes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Specialties &amp; certifications</CardTitle>
          <CardDescription>The master list therapists can be assigned and approved for.</CardDescription>
        </CardHeader>
        <CardContent>
          <CertificationsManager certifications={certifications} isOwnerViewer={isOwner(ctx)} />
        </CardContent>
      </Card>

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
