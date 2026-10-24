"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Captcha, type CaptchaHandle, requestCaptchaToken } from "@/components/auth/captcha";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { webAuthApi } from "@/lib/auth/auth-api";
import { resendCode } from "@dodi/client-state";
import {
  signInToJoin,
  verifyJoinCode,
  type InvitationPreview,
} from "@dodi/client-state/family-members";

import { useFinishJoin } from "./use-join";

interface JoinSignInProps {
  invitation: InvitationPreview;
  secret: string;
  intro: string;
  onCreateAccount: () => void;
}

/** The invited address already has a login: sign in with it, then join. */
export function JoinSignIn({ invitation, secret, intro, onCreateAccount }: JoinSignInProps) {
  const t = useTranslations("join");
  const tAuth = useTranslations("auth");
  const finish = useFinishJoin(invitation.id, secret);
  const email = invitation.invitedEmail;
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [step, setStep] = useState<"form" | "code">("form");
  const captchaRef = useRef<CaptchaHandle>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsBusy(true);
    const captcha = await requestCaptchaToken(captchaRef);
    if (!captcha.ok) {
      setError(tAuth("captchaUnavailable"));
      setIsBusy(false);
      return;
    }
    const outcome = await signInToJoin(webAuthApi, { email, password, captchaToken: captcha.token });
    if (outcome.kind === "needs_code") {
      setIsBusy(false);
      setStep("code");
      return;
    }
    if (outcome.kind === "error") {
      setError(outcome.key ? tAuth(outcome.key) : (outcome.message ?? ""));
      setIsBusy(false);
      return;
    }
    setError(await finish(password));
    setIsBusy(false);
  }

  if (step === "code") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{tAuth("enterCodeTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <VerifyCodeForm
            description={tAuth("enterCodeDescription", { email })}
            onVerify={async (code) => {
              const failure = await verifyJoinCode(webAuthApi, { email, code });
              return failure ? tAuth(failure) : finish(password);
            }}
            onResend={async () => {
              const captcha = await requestCaptchaToken(captchaRef);
              if (!captcha.ok) return tAuth("captchaUnavailable");
              const failure = await resendCode(webAuthApi, { email, captchaToken: captcha.token });
              return failure ? tAuth(failure) : null;
            }}
            onBack={() => setStep("form")}
          >
            <Captcha ref={captchaRef} action="sign-in" />
          </VerifyCodeForm>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{intro}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={signIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-signin-email">{tAuth("email")}</Label>
            <Input id="join-signin-email" type="email" value={email} readOnly />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-signin-password">{tAuth("password")}</Label>
            <Input
              id="join-signin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Captcha ref={captchaRef} action="sign-in" />
          <Button type="submit" className="min-h-11 w-full" disabled={isBusy || !password}>
            {isBusy ? t("joining") : t("signInAndJoin")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-sm">
        <button type="button" onClick={onCreateAccount} className="font-medium text-primary hover:underline">
          {t("needAccount")}
        </button>
      </CardFooter>
    </Card>
  );
}
