import { getTherapistPortalData } from "@/lib/therapist/portal-data";
import { TherapistPortalView } from "@/components/therapist/therapist-portal-view";

export default async function TherapistPortalPage() {
  const data = await getTherapistPortalData();
  return <TherapistPortalView data={data} />;
}
