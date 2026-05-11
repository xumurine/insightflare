import type { SystemRole } from "@/lib/session";

export type TeamRole = "owner" | "admin" | "member";

export function toTeamRole(value: unknown): TeamRole {
  const s = String(value ?? "member").toLowerCase();
  if (s === "owner") return "owner";
  if (s === "admin") return "admin";
  return "member";
}

export function canManageTeam(
  role: TeamRole | string | undefined | null,
  systemRole: SystemRole,
): boolean {
  if (systemRole === "admin") return true;
  const r = toTeamRole(role);
  return r === "owner" || r === "admin";
}

export function canAdministerTeam(
  role: TeamRole | string | undefined | null,
  systemRole: SystemRole,
): boolean {
  if (systemRole === "admin") return true;
  return toTeamRole(role) === "owner";
}
