import { PublicNav } from "@/components/public-nav";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <PublicNav />
      {children}
    </div>
  );
}
