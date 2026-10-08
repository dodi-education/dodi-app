import { redirect } from "next/navigation";

/** Legacy path: personas are a tab of Companions now. */
export default function PersonasRedirectPage() {
  redirect("/parent/companions?tab=personas");
}
