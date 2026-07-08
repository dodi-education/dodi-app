import type { Metadata } from "next";

import { PricingPage } from "@/components/pricing-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("de", "pricing");

export default function Page() {
  return <PricingPage locale="de" />;
}
