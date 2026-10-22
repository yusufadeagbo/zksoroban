import type { Request, Response, NextFunction } from "express";

export function createAuthMiddleware(expectedApiKey?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const configuredKey = expectedApiKey ?? process.env.API_KEY;

    // If no API_KEY configured, authentication is disabled
    if (!configuredKey) {
      return next();
    }

    const providedKey = req.headers["x-api-key"];

    if (!providedKey || providedKey !== configuredKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}
