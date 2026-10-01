import { redirect } from "next/navigation";

/** Old booking link: C&R's page now lives at /b/candr. */
export default function BookPage() {
  redirect("/b/candr");
}
