import { requireStaffContext } from "@/lib/auth/session";

export default async function PosLayout({ children }: LayoutProps<"/pos">) {
  await requireStaffContext();

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="border-b border-border bg-card px-6 py-3">
        <p className="text-sm font-semibold">C&amp;R Point of Sale</p>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
