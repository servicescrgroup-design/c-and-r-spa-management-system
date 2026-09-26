import { requireStaffContext } from "@/lib/auth/session";
import { signOutStaff } from "@/lib/auth/actions";
import { ViewSwitcher } from "@/components/view-switcher";
import { AutoTranslate } from "@/components/i18n/auto-translate";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { getUiLocale } from "@/lib/i18n/locale";

export default async function TherapistLayout({ children }: LayoutProps<"/therapist">) {
  const ctx = await requireStaffContext();
  const canAccessAdmin = ctx.roles.some((r) => r.role === "owner" || r.role === "manager");
  const userLabel = ctx.firstName || ctx.email;
  const locale = await getUiLocale();

  return (
    <div className="flex min-h-svh flex-1 flex-col" data-i18n-pending={locale === "th" ? "" : undefined}>
      <AutoTranslate locale={locale} />
      <header className="glass-bar sticky top-0 z-40 border-b border-black/5 dark:border-white/10">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-4 sm:px-6">
          <p className="text-[15px] font-semibold tracking-tight">
            C&amp;R <span className="font-normal text-muted-foreground">Team</span>
          </p>
          <div className="flex items-center gap-1">
            <LanguageToggle locale={locale} />
            {canAccessAdmin ? (
              <ViewSwitcher canAccessAdmin canAccessPos userLabel={userLabel} compact />
            ) : (
              <form action={signOutStaff}>
                <button
                  type="submit"
                  className="rounded-full px-3 py-1.5 text-[13px] text-accent transition-colors hover:bg-muted"
                >
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
