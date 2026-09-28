import { getTherapistPortalData } from "@/lib/therapist/portal-data";
import { getUiLocale } from "@/lib/i18n/locale";
import { TherapistPortalView } from "@/components/therapist/therapist-portal-view";

export default async function TherapistPortalPage() {
  const [data, locale] = await Promise.all([getTherapistPortalData(), getUiLocale("th")]);
  return <TherapistPortalView data={data} locale={locale} />;
}
