import type { Metadata } from "next";

import { AboutPage } from "@/components/about-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("en", "about");

export default function Page() {
  return <AboutPage locale="en" />;
}
