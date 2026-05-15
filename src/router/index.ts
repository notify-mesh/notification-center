import "server-only";

import { health } from "./procedures/health";
import { me, signOut, requestPasswordReset } from "./procedures/auth";
import * as teams from "./procedures/teams";
import * as apikeys from "./procedures/apikeys";
import * as devices from "./procedures/devices";
import * as audit from "./procedures/audit";
import * as passkeys from "./procedures/passkeys";
import * as projects from "./procedures/projects";
import * as environments from "./procedures/environments";
import * as providers from "./procedures/providers";
import * as channels from "./procedures/channels";
import * as templates from "./procedures/templates";
import * as notificationsSend from "./procedures/notifications-send";
import * as analytics from "./procedures/analytics";
import * as invitations from "./procedures/invitations";
import * as permissions from "./procedures/permissions";

/**
 * The single root router exposed by both the RPC handler (`/rpc`) and the
 * OpenAPI handler (`/api`). Each namespace is a flat record of procedures.
 */
export const router = {
  system: { health },
  auth: { me, signOut, requestPasswordReset },
  teams: {
    list: teams.list,
    create: teams.create,
    update: teams.update,
    setActive: teams.setActive,
    remove: teams.remove,
  },
  apiKeys: {
    list: apikeys.list,
    create: apikeys.create,
    update: apikeys.update,
    rotate: apikeys.rotate,
    revoke: apikeys.revoke,
    options: apikeys.projectsAndEnvs,
  },
  devices: {
    list: devices.list,
    revoke: devices.revoke,
    revokeOthers: devices.revokeOthers,
  },
  audit: {
    listAuthEvents: audit.listAuthEvents,
    listAdminEvents: audit.listAdminEvents,
  },
  passkeys: {
    list: passkeys.list,
  },
  projects: {
    list: projects.list,
    get: projects.get,
    create: projects.create,
    update: projects.update,
    archive: projects.archive,
    restore: projects.restore,
  },
  environments: {
    list: environments.list,
    create: environments.create,
    updateSettings: environments.updateSettings,
    setDefault: environments.setDefault,
    archive: environments.archive,
  },
  providers: {
    catalog: providers.catalog,
    list: providers.list,
    upsert: providers.upsert,
    test: providers.test,
    remove: providers.remove,
  },
  channels: {
    list: channels.list,
    upsert: channels.upsert,
    remove: channels.remove,
  },
  templates: {
    list: templates.list,
    create: templates.create,
    publishVariant: templates.publishVariant,
    updateVariant: templates.updateVariant,
    archive: templates.archive,
    preview: templates.preview,
  },
  notifications: {
    send: notificationsSend.send,
  },
  analytics: {
    summary: analytics.summary,
  },
  invitations: {
    list: invitations.list,
    send: invitations.send,
    cancel: invitations.cancel,
  },
  permissions: {
    listRoles: permissions.listRoles,
    listPermissions: permissions.listPermissions,
    listAssignments: permissions.listAssignments,
    listOrgMembers: permissions.listOrgMembers,
    createRole: permissions.createRole,
    updateRolePerms: permissions.updateRolePerms,
    deleteRole: permissions.deleteRole,
    grantUserRole: permissions.grantUserRole,
    revokeUserRole: permissions.revokeUserRole,
  },
} as const;

export type AppRouter = typeof router;
