import { redirect } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { AdminNav } from "@/components/admin/admin-nav";
import { AutoTranslate } from "@/components/i18n/auto-translate";
import { getUiLocale } from "@/lib/i18n/locale";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await requireStaffContext();
  if (!ctx.roles.some((r) => r.role === "owner" || r.role === "manager")) {
    redirect(ctx.roles.some((r) => r.role === "front_desk") ? "/pos" : "/therapist");
  }

  const locale = await getUiLocale();

  return (
    <div className="flex min-h-svh flex-1 flex-col" data-i18n-pending={locale === "th" ? "" : undefined}>
      <AutoTranslate locale={locale} />
      <AdminNav userLabel={ctx.firstName || ctx.email} isOwner={isOwner(ctx)} locale={locale} />
      {/* Room for the sidebar on wide screens and the tab bar on phones. */}
      <div className="flex-1 lg:pl-60">
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:pb-16">{children}</main>
      </div>
    </div>
  );
}
