import { redirect } from "next/navigation";

interface AgentsRedirectPageProps {
  searchParams: Promise<{ code?: string | string[] }>;
}

/** Legacy path: Agents → Access; an old approval link (`?code=`) → "Allow access". */
export default async function AgentsRedirectPage({ searchParams }: AgentsRedirectPageProps) {
  const { code } = await searchParams;
  const value = Array.isArray(code) ? code[0] : code;
  redirect(value ? `/parent/authorize?code=${encodeURIComponent(value)}` : "/parent/settings/access");
}
