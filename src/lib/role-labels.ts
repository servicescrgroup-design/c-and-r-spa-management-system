// The 'manager' role_type enum value is unchanged in the database (renaming
// a Postgres enum value used throughout RLS policies and functions is far
// riskier than it's worth) — this only controls what the UI calls it.
export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Admin (Backend Team)",
  front_desk: "Front desk",
  therapist: "Therapist",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.replace("_", " ");
}
