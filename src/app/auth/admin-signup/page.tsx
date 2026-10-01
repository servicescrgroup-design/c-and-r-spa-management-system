import { redirect } from "next/navigation";

/** The old one-time admin claim page. New owners create their own business at /signup. */
export default function AdminSignupPage() {
  redirect("/signup");
}
