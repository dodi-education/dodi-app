import { Hanken_Grotesk, Nunito } from "next/font/google";
import type { ReactNode } from "react";

import type { Locale } from "@/lib/site";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

/**
 * Shared <html>/<body> shell. Each locale's root layout renders this with its own
 * `lang`, so German pages get `<html lang="de">` without any runtime routing —
 * the locale is known statically from which route group rendered the page.
 */
export function RootHtml({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <html lang={locale}>
      <body
        className={`${hanken.variable} ${nunito.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
