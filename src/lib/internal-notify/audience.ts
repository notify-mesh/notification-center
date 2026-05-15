import "server-only";

import { prismaDbClient } from "@root/lib/prisma";

/**
 * Audience model for InternalNotification.
 *
 * Permission rules — enforced at resolve time. A sender is a regular user
 * unless `senderRole === "admin"` (Better Auth admin plugin role).
 *
 *   GLOBAL          → admins only. Recipients: every active, non-deleted user.
 *   ORGANIZATION    → admin OR sender is a Member of orgId. Recipients: every
 *                     Member of orgId.
 *   PROJECT         → admin OR sender is a Member of the project's org.
 *                     Recipients: members of the project's org. (Projects
 *                     don't have explicit per-user ACL yet — the org-wide
 *                     fan-out is the safe default.)
 *   TEAM            → admin OR sender is a TeamMember of teamId OR a Member
 *                     of the team's org. Recipients: every TeamMember of teamId.
 *   USERS           → arbitrary user-id list. Each id must be either a fellow
 *                     org member (any shared org with the sender) or unrestricted
 *                     when the sender is admin.
 */
export type AudienceTarget =
  | { kind: "GLOBAL" }
  | { kind: "ORGANIZATION"; organizationId: string }
  | { kind: "PROJECT"; projectId: string }
  | { kind: "TEAM"; teamId: string }
  | { kind: "USERS"; userIds: string[] };

export interface ResolvedAudience {
  audienceKind: AudienceTarget["kind"];
  audienceLabel: string;
  userIds: string[];
  /** When non-null, send was rejected and the error message explains why. */
  denied?: string;
}

export interface AudienceContext {
  senderUserId: string;
  senderRole: string | null;
}

/**
 * Resolve a target to a concrete recipient list. Returns the user-id set,
 * a human label captured at resolve time, and an optional `denied` reason.
 *
 * Implementation note: the queries are intentionally narrow (id-only `select`
 * statements + small role checks) because audiences can be in the thousands
 * for global broadcasts. We never load full user rows here.
 */
export async function resolveAudience(
  target: AudienceTarget,
  ctx: AudienceContext,
): Promise<ResolvedAudience> {
  const isAdmin = ctx.senderRole === "admin";

  switch (target.kind) {
    case "GLOBAL": {
      if (!isAdmin) {
        return deny("GLOBAL", "Only super-admins can broadcast to every user.");
      }
      const rows = await prismaDbClient.user.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true },
      });
      return {
        audienceKind: "GLOBAL",
        audienceLabel: `All users (${rows.length})`,
        userIds: rows.map((r) => r.id),
      };
    }

    case "ORGANIZATION": {
      const org = await prismaDbClient.organization.findUnique({
        where: { id: target.organizationId },
        select: { id: true, name: true },
      });
      if (!org) return deny("ORGANIZATION", "Organization not found.");
      if (!isAdmin) {
        const senderMember = await prismaDbClient.member.findFirst({
          where: { organizationId: org.id, userId: ctx.senderUserId },
          select: { id: true },
        });
        if (!senderMember) {
          return deny("ORGANIZATION", "You are not a member of this organization.");
        }
      }
      const members = await prismaDbClient.member.findMany({
        where: { organizationId: org.id, user: { isActive: true, deletedAt: null } },
        select: { userId: true },
      });
      return {
        audienceKind: "ORGANIZATION",
        audienceLabel: `Org · ${org.name} (${members.length})`,
        userIds: dedupe(members.map((m) => m.userId)),
      };
    }

    case "PROJECT": {
      const project = await prismaDbClient.project.findUnique({
        where: { id: target.projectId },
        select: {
          id: true,
          name: true,
          organizationId: true,
          organization: { select: { name: true } },
        },
      });
      if (!project) return deny("PROJECT", "Project not found.");
      if (!isAdmin) {
        const senderMember = await prismaDbClient.member.findFirst({
          where: { organizationId: project.organizationId, userId: ctx.senderUserId },
          select: { id: true },
        });
        if (!senderMember) {
          return deny("PROJECT", "You are not a member of this project's organization.");
        }
      }
      const members = await prismaDbClient.member.findMany({
        where: {
          organizationId: project.organizationId,
          user: { isActive: true, deletedAt: null },
        },
        select: { userId: true },
      });
      return {
        audienceKind: "PROJECT",
        audienceLabel: `Project · ${project.name} (${members.length})`,
        userIds: dedupe(members.map((m) => m.userId)),
      };
    }

    case "TEAM": {
      const team = await prismaDbClient.team.findUnique({
        where: { id: target.teamId },
        select: { id: true, name: true, organizationId: true },
      });
      if (!team) return deny("TEAM", "Team not found.");
      if (!isAdmin) {
        const allowed = await prismaDbClient.member.findFirst({
          where: { organizationId: team.organizationId, userId: ctx.senderUserId },
          select: { id: true },
        });
        if (!allowed) {
          return deny("TEAM", "You are not in this team's organization.");
        }
      }
      const teamMembers = await prismaDbClient.teamMember.findMany({
        where: { teamId: team.id, user: { isActive: true, deletedAt: null } },
        select: { userId: true },
      });
      return {
        audienceKind: "TEAM",
        audienceLabel: `Team · ${team.name} (${teamMembers.length})`,
        userIds: dedupe(teamMembers.map((m) => m.userId)),
      };
    }

    case "USERS": {
      const unique = dedupe(target.userIds);
      if (unique.length === 0) return deny("USERS", "No recipients selected.");
      if (unique.length > 500) return deny("USERS", "Maximum 500 recipients per send.");

      if (!isAdmin) {
        // Validate every recipient shares at least one org with the sender.
        const senderOrgIds = await prismaDbClient.member.findMany({
          where: { userId: ctx.senderUserId },
          select: { organizationId: true },
        });
        if (senderOrgIds.length === 0) {
          return deny("USERS", "You don't belong to any organization.");
        }
        const orgIds = senderOrgIds.map((o) => o.organizationId);
        const allowed = await prismaDbClient.member.findMany({
          where: { organizationId: { in: orgIds }, userId: { in: unique } },
          select: { userId: true },
        });
        const allowedIds = new Set(allowed.map((a) => a.userId));
        const blocked = unique.filter((id) => !allowedIds.has(id));
        if (blocked.length > 0) {
          return deny("USERS", `${blocked.length} recipient(s) are outside your organizations.`);
        }
      }

      const users = await prismaDbClient.user.findMany({
        where: { id: { in: unique }, isActive: true, deletedAt: null },
        select: { id: true, name: true },
      });
      const label =
        users.length === 1
          ? `User · ${users[0].name}`
          : `${users.length} user${users.length === 1 ? "" : "s"}`;
      return {
        audienceKind: "USERS",
        audienceLabel: label,
        userIds: users.map((u) => u.id),
      };
    }
  }
}

/**
 * List audience options the *sender* can target. Used by the composer UI.
 * Admins see everything; regular users see only their own orgs/teams/projects.
 */
export interface AudienceOptions {
  isAdmin: boolean;
  organizations: Array<{ id: string; name: string; memberCount: number }>;
  projects: Array<{ id: string; name: string; organizationName: string }>;
  teams: Array<{ id: string; name: string; organizationName: string; memberCount: number }>;
}

export async function listAudienceOptions(ctx: AudienceContext): Promise<AudienceOptions> {
  const isAdmin = ctx.senderRole === "admin";

  const orgWhere = isAdmin
    ? { isActive: true, archivedAt: null }
    : { members: { some: { userId: ctx.senderUserId } }, isActive: true, archivedAt: null };

  const orgs = await prismaDbClient.organization.findMany({
    where: orgWhere,
    select: {
      id: true,
      name: true,
      _count: { select: { members: true } },
    },
    orderBy: { name: "asc" },
  });
  const orgIds = orgs.map((o) => o.id);

  const [projects, teams] = await Promise.all([
    prismaDbClient.project.findMany({
      where: { organizationId: { in: orgIds }, archivedAt: null },
      select: {
        id: true,
        name: true,
        organization: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prismaDbClient.team.findMany({
      where: { organizationId: { in: orgIds }, isActive: true },
      select: {
        id: true,
        name: true,
        organization: { select: { name: true } },
        _count: { select: { teammembers: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    isAdmin,
    organizations: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      memberCount: o._count.members,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      organizationName: p.organization.name,
    })),
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      organizationName: t.organization.name,
      memberCount: t._count.teammembers,
    })),
  };
}

function deny(kind: AudienceTarget["kind"], reason: string): ResolvedAudience {
  return { audienceKind: kind, audienceLabel: "", userIds: [], denied: reason };
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
