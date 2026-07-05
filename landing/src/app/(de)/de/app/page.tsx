import type { Metadata } from "next";

import { PlatformPage } from "@/components/platform-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("de", "platform");

export default function Page() {
  return <PlatformPage locale="de" />;
}
