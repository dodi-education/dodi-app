import { AuthorizeAccess } from "@/components/parent/access/authorize-access";

interface AuthorizePageProps {
  /** `?code=` comes from the link a robot or `dodi login` prints. */
  searchParams: Promise<{ code?: string | string[] }>;
}

/** "Allow access" for a robot or agent; behind the parent layout's vault and PIN gates. */
export default async function AuthorizePage({ searchParams }: AuthorizePageProps) {
  const { code } = await searchParams;
  const value = (Array.isArray(code) ? code[0] : code) ?? "";
  return <AuthorizeAccess key={value} code={value} />;
}
