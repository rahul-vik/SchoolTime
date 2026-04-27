import { getRolePermissionContext, hasPermission } from "../services/roleAccess.js";

export function requirePermission(db, permissionKey) {
  return async (req, res, next) => {
    if (!req.auth?.userId || !req.auth?.orgId) {
      res.status(401).json({ error: "Missing auth context" });
      return;
    }
    const user = await db.get("SELECT role FROM users WHERE id = ? AND org_id = ?", req.auth.userId, req.auth.orgId);
    if (!user?.role) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const ctx = await getRolePermissionContext(db, user.role);
    req.auth.role = ctx.role;
    req.auth.permissions = ctx.permissions;
    if (!hasPermission(ctx.permissions, permissionKey)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
