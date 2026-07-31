import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Nunito } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import { DateFormatProvider } from "@/components/providers/date-format-provider";

import "./globals.css";

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

export const metadata: Metadata = {
  title: "dodi — AI Learning Companion for Kids",
  description:
    "A personalized, AI-powered learning platform that creates fun, targeted educational experiences for kids.",
  applicationName: "dodi",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "dodi",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F5F8FB",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        className={`${hanken.variable} ${nunito.variable} font-sans antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <DateFormatProvider>{children}</DateFormatProvider>
        </NextIntlClientProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
