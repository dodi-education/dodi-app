"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useTranslations } from "next-intl";

import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function LoginCard() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  // Deep-link target appended by middleware when an unauthenticated visitor
  // hits a protected route; validated inside LoginForm before navigating.
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  // Set by Settings > Delete account after the account is gone.
  const isAccountDeleted = searchParams.get("deleted") === "1";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("welcomeBack")}</CardTitle>
        <CardDescription>{t("signInDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isAccountDeleted && (
          <p role="status" className="mb-4 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
            {t("accountDeleted")}
          </p>
        )}
        <LoginForm next={next} />
      </CardContent>
      <CardFooter className="flex flex-col gap-2 text-sm">
        <Link
          href="/reset-password"
          className="text-muted-foreground hover:underline"
        >
          {t("forgotPassword")}
        </Link>
        <p className="text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {tc("signUp")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary for the build-time prerender.
  return (
    <Suspense fallback={null}>
      <LoginCard />
    </Suspense>
  );
}
