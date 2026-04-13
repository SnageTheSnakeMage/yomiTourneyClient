import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  const prisma = new PrismaClient({
    log: [{ level: "error", emit: "event" }],
  });

  await prisma.$connect();

  fastify.decorate("prisma", prisma);

  fastify.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
};

export default fp(prismaPlugin, { name: "prisma" });

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
