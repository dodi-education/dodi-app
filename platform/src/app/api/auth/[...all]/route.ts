import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

/** Better Auth endpoints (sign-in, OTP, session, password ops) under /api/auth. */
export const { GET, POST } = toNextJsHandler(auth);
