"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InvitationPreview } from "@dodi/client-state/family-members";

import { useFinishJoin } from "./use-join";

interface JoinConfirmPasswordProps {
  invitation: InvitationPreview;
  secret: string;
  intro: string;
}

/** Already signed in with the invited address: the password seals the family's key to them. */
export function JoinConfirmPassword({ invitation, secret, intro }: JoinConfirmPasswordProps) {
  const t = useTranslations("join");
  const tAuth = useTranslations("auth");
  const finish = useFinishJoin(invitation.id, secret);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsJoining(true);
    setError(await finish(password));
    setIsJoining(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{intro}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t("confirmPasswordHint")}</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-password">{tAuth("password")}</Label>
            <Input
              id="join-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="min-h-11 w-full" disabled={isJoining || !password}>
            {isJoining ? t("joining") : t("join")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
