import type { TeamRole } from "@/lib/dashboard/permissions";

export interface TeamData {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  createdAt: number;
  updatedAt?: number;
  siteCount: number;
  memberCount: number;
  membershipRole?: TeamRole;
}

export interface SiteData {
  id: string;
  teamId: string;
  name: string;
  domain: string;
  iconPath?: string;
  publicEnabled: number | boolean;
  publicSlug: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MemberData {
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: number;
  username: string;
  email: string;
  name: string | null;
}

export interface AccountUserData {
  id: string;
  username: string;
  email: string;
  name: string;
  systemRole: "admin" | "user";
  timeZone?: string;
  createdAt: number;
  updatedAt: number;
  teamCount?: number;
  ownedTeamCount?: number;
}

export type ApiKeyScope =
  | "analytics:read"
  | "site:read"
  | "site:write"
  | "site_config:read"
  | "site_config:write";

export interface ApiKeyData {
  id: string;
  teamId: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  siteIds: string[];
  createdByUserId: string;
  expiresAt: number | null;
  revokedAt: number | null;
  revokedByUserId: string;
  rotatedFromKeyId: string;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
  status: "active" | "expired" | "revoked";
}
