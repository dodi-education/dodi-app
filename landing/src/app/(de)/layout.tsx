import type { Metadata } from "next";

import { RootHtml } from "@/components/root-html";
import { buildMetadata } from "@/lib/metadata";

import "../globals.css";

export const metadata: Metadata = buildMetadata("de");

export default function GermanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RootHtml locale="de">{children}</RootHtml>;
}
