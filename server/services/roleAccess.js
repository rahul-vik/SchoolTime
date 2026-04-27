import { getRoleAccessPolicy } from "./platformSettings.js";

const FALLBACK_PERMISSIONS = {
  owner: { canManageUsers: true, canManageCredits: true, canViewAudit: true, canManageApiKeys: true, canConfigureTimetable: true },
  admin: { canManageUsers: true, canManageCredits: true, canViewAudit: true, canManageApiKeys: true, canConfigureTimetable: true },
  staff: { canManageUsers: false, canManageCredits: false, canViewAudit: false, canManageApiKeys: false, canConfigureTimetable: true },
};
const DENY_ALL_PERMISSIONS = {
  canManageUsers: false,
  canManageCredits: false,
  canViewAudit: false,
  canManageApiKeys: false,
  canConfigureTimetable: false,
};

function normalizeRoleKey(value) {
  return String(value || "").trim().toLowerCase();
}

export async function getRolePermissionContext(db, roleInput) {
  const role = normalizeRoleKey(roleInput);
  const policy = await getRoleAccessPolicy(db);
  const roles = Array.isArray(policy?.roles) ? policy.roles : [];
  const configured = roles.find((r) => normalizeRoleKey(r.key) === role);
  const fallback = FALLBACK_PERMISSIONS[role] || DENY_ALL_PERMISSIONS;
  const permissions = {
    canManageUsers: Boolean(configured?.canManageUsers ?? fallback.canManageUsers),
    canManageCredits: Boolean(configured?.canManageCredits ?? fallback.canManageCredits),
    canViewAudit: Boolean(configured?.canViewAudit ?? fallback.canViewAudit),
    canManageApiKeys: Boolean(configured?.canManageApiKeys ?? fallback.canManageApiKeys),
    canConfigureTimetable: Boolean(configured?.canConfigureTimetable ?? fallback.canConfigureTimetable),
  };
  const availableRoles = Array.from(new Set(["owner", "admin", "staff", ...roles.map((r) => normalizeRoleKey(r.key)).filter(Boolean)]));
  return { role, permissions, availableRoles, policy };
}

export function hasPermission(permissions, permissionKey) {
  return Boolean(permissions && permissions[permissionKey]);
}
