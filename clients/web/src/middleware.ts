import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets (images, icons, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|images/|avatars/|animations/|icons/|sounds/|manifest.json|manifest.webmanifest|sw.js|sitemap.xml|robots.txt).*)",
  ],
};
