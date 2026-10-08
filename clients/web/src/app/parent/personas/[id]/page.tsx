import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Legacy path: personas moved under Companions. */
export default async function PersonaRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/parent/companions/personas/${id}`);
}
