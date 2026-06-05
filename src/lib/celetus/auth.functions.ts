import { createServerFn } from "@tanstack/react-start";

export const getAuthMode = createServerFn({ method: "GET" }).handler(async () => ({
  loginRequired: process.env.CELETUS_REQUIRE_LOGIN === "true",
}));
