import type { AppContext } from "./app-context";

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
  }
}
