import type { Metadata } from "next";

import { RootHtml } from "@/components/root-html";
import { buildMetadata } from "@/lib/metadata";

import "../globals.css";
import "../site.css";
import "../mocks.css";

export const metadata: Metadata = buildMetadata("en");

export default function EnglishLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RootHtml locale="en">{children}</RootHtml>;
}
