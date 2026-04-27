import { verifyAuthToken } from "../auth.js";

export function creatorAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing auth token" });
    return;
  }
  try {
    const decoded = verifyAuthToken(token);
    if (decoded.scope !== "platform_creator") {
      res.status(403).json({ error: "Platform portal token required" });
      return;
    }
    req.creatorAuth = { scope: decoded.scope };
    next();
  } catch {
    res.status(401).json({ error: "Invalid auth token" });
  }
}
