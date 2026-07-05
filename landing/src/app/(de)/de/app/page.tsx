import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("de", "app");

export default function Page() {
  return <AppPage locale="de" />;
}
