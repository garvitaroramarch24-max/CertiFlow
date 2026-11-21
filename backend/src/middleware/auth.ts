import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
export interface Actor {
  id: string;
  role: Role;
  district?: string;
}
declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}
// Demo identity header. Replace with verified JWT/OIDC in production.
export function demoAuth(req: Request, res: Response, next: NextFunction) {
  const id = String(req.header("x-demo-user") || "");
  const users: Record<string, Actor> = {
    anika: { id: "anika", role: "CENTRE" },
    dev: { id: "dev", role: "DISTRICT_OFFICER", district: "Hyderabad" },
    meera: { id: "meera", role: "DISTRICT_OFFICER", district: "Hyderabad" },
    kabir: { id: "kabir", role: "DISTRICT_OFFICER", district: "Hyderabad" },
    neha: { id: "neha", role: "QUALITY" },
    farah: { id: "farah", role: "STATE" },
  };
  if (!users[id])
    return res
      .status(401)
      .json({ error: "Select a valid demo user via x-demo-user header" });
  req.actor = users[id];
  next();
}
export function allow(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.actor || !roles.includes(req.actor.role))
      return res.status(403).json({ error: "Forbidden for this role" });
    next();
  };
}
