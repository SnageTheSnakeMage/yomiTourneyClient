import type { Player } from "@prisma/client";

// JWT payload stored in every signed token
export interface JwtPayload {
  sub: string;   // player.id (cuid)
  steamId: string;
  isAdmin: boolean;
  iat?: number;
  exp?: number;
}

// Fastify request user after auth verification
declare module "fastify" {
  interface FastifyRequest {
    player: Player;
  }
}
