import "server-only";
import type { Enums } from "@/types/database.types";

export type RoleType = Enums<"role_type">;

export type StaffContext = {
  staffId: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: { branchId: string | null; role: RoleType }[];
};

export function isOwner(ctx: Pick<StaffContext, "roles">): boolean {
  return ctx.roles.some((r) => r.role === "owner");
}

/** A role saved with no branch ("All branches") covers every branch, the
 * same rule the database's app.has_branch_role uses. */
export function hasBranchRole(ctx: Pick<StaffContext, "roles">, branchId: string, allowed: RoleType[]): boolean {
  return ctx.roles.some((r) => allowed.includes(r.role) && (r.branchId === null || r.branchId === branchId));
}

export function branchIdsForRoles(
  ctx: Pick<StaffContext, "roles">,
  allowed: RoleType[],
): string[] {
  if (isOwner(ctx)) return []; // empty = "all branches" for an owner; callers should check isOwner first
  return ctx.roles.filter((r) => allowed.includes(r.role) && r.branchId).map((r) => r.branchId as string);
}
