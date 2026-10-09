import { redirect } from "next/navigation";

/** Legacy path: Devices → Access. */
export default function DevicesRedirectPage() {
  redirect("/parent/settings/access");
}
