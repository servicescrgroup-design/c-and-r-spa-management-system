import { redirect } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { PosNav } from "@/components/pos/pos-nav";

export default async function PosLayout({ children }: LayoutProps<"/pos">) {
  const ctx = await requireStaffContext();
  if (!ctx.roles.some((r) => r.role === "owner" || r.role === "manager" || r.role === "front_desk")) {
    redirect("/therapist");
  }
  const canAccessAdmin = ctx.roles.some((r) => r.role === "owner" || r.role === "manager");

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <PosNav canAccessAdmin={canAccessAdmin} userLabel={ctx.firstName || ctx.email} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pb-12 sm:pt-8">{children}</main>
    </div>
  );
}
