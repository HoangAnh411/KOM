import "fastify";

declare module "fastify" {
  interface FastifyReply {
    setCookie(name: string, value: string, options: { httpOnly?: boolean; sameSite?: string; secure?: boolean; path?: string; maxAge?: number }): this;
    clearCookie(name: string, options: { path?: string }): this;
  }
}
