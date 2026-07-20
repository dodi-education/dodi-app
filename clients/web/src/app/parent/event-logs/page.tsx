import { redirect } from "next/navigation";

/** Legacy path: Event logs → Activities (Insights). */
export default function EventLogsRedirectPage() {
  redirect("/parent/activities");
}
