import type { Metadata } from "next";

import { AboutPage } from "@/components/about-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("de", "about");

export default function Page() {
  return <AboutPage locale="de" />;
}
