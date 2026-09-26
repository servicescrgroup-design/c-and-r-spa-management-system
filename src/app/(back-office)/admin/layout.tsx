import { redirect } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await requireStaffContext();
  if (!ctx.roles.some((r) => r.role === "owner" || r.role === "manager")) {
    redirect(ctx.roles.some((r) => r.role === "front_desk") ? "/pos" : "/therapist");
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <AdminNav userLabel={ctx.firstName || ctx.email} isOwner={isOwner(ctx)} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-10">{children}</main>
    </div>
  );
}
