import { Router } from "express";
import { signCreatorToken } from "../auth.js";
import { isCreatorPortalConfigured, verifyCreatorPortalPassword } from "../services/creatorPassword.js";

export function createCreatorAuthRoutes() {
  const router = Router();

  // Full URL: POST /api/creator/login (see server/index.js mount order).
  router.post("/login", (req, res) => {
    if (!isCreatorPortalConfigured()) {
      return res.status(503).json({
        error: "Platform portal is not configured. Set CREATOR_PORTAL_PASSWORD or CREATOR_PORTAL_PASSWORD_HASH in the server environment.",
      });
    }
    const password = String(req.body?.password || "");
    if (!password) return res.status(400).json({ error: "Password required" });
    if (!verifyCreatorPortalPassword(password)) return res.status(401).json({ error: "Invalid password" });
    res.json({ token: signCreatorToken(), tokenType: "platform_creator" });
  });

  return router;
}
