import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { getStaffBranches, getWorkingBranch } from "@/lib/pos/session";
import { bangkokToday, defaultShift, getChecklistDay, type Shift } from "@/lib/checklists";
import { ChecklistBoard } from "@/components/checklist/checklist-board";
import { cn } from "@/lib/utils";

const SHIFTS: Shift[] = ["opening", "midday", "closing"];

export default async function ChecklistPage({ searchParams }: PageProps<"/pos/checklist">) {
  const sp = await searchParams;
  const ctx = await requireStaffContext();
  const [branches, working] = await Promise.all([getStaffBranches(), getWorkingBranch()]);
  if (branches.length === 0) redirect("/pos");
  const wanted = typeof sp.branchId === "string" ? sp.branchId : null;
  const branch =
    branches.find((b) => b.id === wanted) ?? branches.find((b) => b.id === working?.branch.id) ?? branches[0];
  const shift = SHIFTS.includes(sp.shift as Shift) ? (sp.shift as Shift) : defaultShift();
  const day = await getChecklistDay(branch.id, bangkokToday(), ctx.staffId);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {branches.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link
              key={b.id}
              href={`/pos/checklist?branchId=${b.id}`}
              className={cn(
                "h-9 rounded-full px-4 text-sm leading-9",
                b.id === branch.id ? "bg-foreground text-background" : "bg-muted hover:bg-secondary",
              )}
              data-no-translate
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}
      <ChecklistBoard key={branch.id} day={day} branchName={branch.name} currentStaffId={ctx.staffId} initialShift={shift} />
    </div>
  );
}
