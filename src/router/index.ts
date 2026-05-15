import "server-only";

import { health } from "./procedures/health";
import { me, signOut, requestPasswordReset } from "./procedures/auth";
import * as teams from "./procedures/teams";
import * as apikeys from "./procedures/apikeys";
import * as devices from "./procedures/devices";
import * as audit from "./procedures/audit";
import * as passkeys from "./procedures/passkeys";

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
} as const;

export type AppRouter = typeof router;
