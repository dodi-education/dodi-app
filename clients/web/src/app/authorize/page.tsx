import { redirect } from "next/navigation";

interface AuthorizeRedirectPageProps {
  searchParams: Promise<{ code?: string | string[] }>;
}

/**
 * The short link robots and the dodi CLI print (`<app>/authorize?code=…`):
 * "Allow access" lives in the parent area, which carries the vault and PIN
 * gates. Signed-out visitors reach this only after login (middleware keeps
 * the query in `next=`).
 */
export default async function AuthorizeRedirectPage({ searchParams }: AuthorizeRedirectPageProps) {
  const { code } = await searchParams;
  const value = Array.isArray(code) ? code[0] : code;
  redirect(value ? `/parent/authorize?code=${encodeURIComponent(value)}` : "/parent/authorize");
}
