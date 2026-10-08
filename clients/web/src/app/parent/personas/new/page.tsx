import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Legacy path: personas moved under Companions. */
export default async function NewPersonaRedirectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  redirect(params.import === "true" ? "/parent/companions/personas/new?import=true" : "/parent/companions/personas/new");
}
