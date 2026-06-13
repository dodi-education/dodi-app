"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVaultStore } from "@/stores/vault-store";

/** Pick `count` distinct indices in [0, length) for the verify step. */
function pickIndices(length: number, count: number): number[] {
  const chosen = new Set<number>();
  while (chosen.size < count && chosen.size < length) {
    chosen.add(Math.floor(Math.random() * length));
  }
  return [...chosen].sort((a, b) => a - b);
}

export default function VaultSetupPage() {
  const router = useRouter();
  const phrase = useVaultStore((s) => s.pendingBackupPhrase);
  const acknowledge = useVaultStore((s) => s.acknowledgeBackupPhrase);

  const words = useMemo(() => (phrase ? phrase.split(" ") : []), [phrase]);
  const verifyIndices = useMemo(() => pickIndices(words.length, 3), [words.length]);

  const [phase, setPhase] = useState<"show" | "verify">("show");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Direct navigation with no phrase to show (e.g. refresh after setup) → leave.
  useEffect(() => {
    if (!phrase) router.replace("/dashboard");
  }, [phrase, router]);

  if (!phrase) return null;

  function finish() {
    acknowledge();
    router.replace("/dashboard");
  }

  function handleVerify() {
    const ok = verifyIndices.every(
      (i) => (answers[i] ?? "").trim().toLowerCase() === words[i],
    );
    if (!ok) {
      setError("Those words don't match. Check your written copy and try again.");
      return;
    }
    finish();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {phase === "show" ? "Save your recovery phrase" : "Confirm your phrase"}
          </CardTitle>
          <CardDescription>
            {phase === "show"
              ? "These 12 words are the ONLY way to recover your account if you forget your password and lose your devices. We can't see them and can't reset them. Write them down and store them somewhere safe — never share them."
              : "Enter the requested words to confirm you've saved your phrase."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {phase === "show" ? (
            <>
              <ol className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 sm:grid-cols-3">
                {words.map((word, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm"
                  >
                    <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="font-medium">{word}</span>
                  </li>
                ))}
              </ol>
              <Button onClick={() => setPhase("verify")} className="w-full">
                I&apos;ve written it down
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {verifyIndices.map((i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <Label htmlFor={`word-${i}`}>Word #{i + 1}</Label>
                    <Input
                      id={`word-${i}`}
                      autoComplete="off"
                      value={answers[i] ?? ""}
                      onChange={(e) => {
                        setError(null);
                        setAnswers((a) => ({ ...a, [i]: e.target.value }));
                      }}
                    />
                  </div>
                ))}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setError(null);
                    setPhase("show");
                  }}
                >
                  Back
                </Button>
                <Button className="flex-1" onClick={handleVerify}>
                  Confirm
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
