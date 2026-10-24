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
  startJoinRegistration,
  verifyJoinCode,
  type InvitationPreview,
} from "@dodi/client-state/family-members";

import { JoinTerms } from "./join-terms";
import { useFinishJoin } from "./use-join";

interface JoinNewLoginProps {
  invitation: InvitationPreview;
  secret: string;
  intro: string;
  onHaveAccount: () => void;
}

/**
 * A new login for the invited address: no family of its own, it joins the
 * inviting one once the emailed code confirms the address. The password stays
 * in memory until then (it seals the person's own key).
 */
export function JoinNewLogin({ invitation, secret, intro, onHaveAccount }: JoinNewLoginProps) {
  const t = useTranslations("join");
  const tAuth = useTranslations("auth");
  const finish = useFinishJoin(invitation.id, secret);
  const email = invitation.invitedEmail;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [step, setStep] = useState<"form" | "code">("form");
  const captchaRef = useRef<CaptchaHandle>(null);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsBusy(true);
    const captcha = await requestCaptchaToken(captchaRef);
    if (!captcha.ok) {
      setError(tAuth("captchaUnavailable"));
      setIsBusy(false);
      return;
    }
    const failure = await startJoinRegistration(webAuthApi, {
      email,
      password,
      confirmPassword,
      invitationId: invitation.id,
      hasAcceptedTerms,
      captchaToken: captcha.token,
    });
    setIsBusy(false);
    if (failure === "invitationInvalid") setError(t("joinUsed"));
    else if (failure) setError(tAuth(failure));
    else setStep("code");
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
            <Captcha ref={captchaRef} action="sign-up" />
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
        <form onSubmit={register} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-email">{tAuth("email")}</Label>
            <Input id="join-email" type="email" value={email} readOnly />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-new-password">{tAuth("password")}</Label>
            <Input
              id="join-new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-confirm-password">{tAuth("confirmPassword")}</Label>
            <Input
              id="join-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <JoinTerms isAccepted={hasAcceptedTerms} onChange={setHasAcceptedTerms} />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Captcha ref={captchaRef} action="sign-up" />
          <Button type="submit" className="min-h-11 w-full" disabled={isBusy}>
            {isBusy ? tAuth("creatingAccount") : t("createAndJoin")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-sm">
        <button type="button" onClick={onHaveAccount} className="font-medium text-primary hover:underline">
          {t("haveAccount")}
        </button>
      </CardFooter>
    </Card>
  );
}
