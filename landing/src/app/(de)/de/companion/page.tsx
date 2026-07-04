import type { Metadata } from "next";

import { CompanionPage } from "@/components/companion-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("de", "companion");

export default function Page() {
  return <CompanionPage locale="de" />;
}
