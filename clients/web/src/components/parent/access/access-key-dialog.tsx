"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { accessDeps } from "@/components/parent/access/access-deps";
import { AgentGrantFields } from "@/components/parent/access/agent-grant-fields";
import { CopyButton } from "@/components/parent/access/copy-button";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createAgentAccessKey } from "@dodi/client-state/authorized-clients";
import {
  AGENT_SCOPES,
  DEFAULT_AGENT_EXPIRY_DAYS,
  DEFAULT_AGENT_SCOPES,
  type AgentScope,
} from "@dodi/protocol/agent-scopes";
import { access } from "@dodi/ui-recipes";

interface AccessKeyDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreated: () => void;
}

/**
 * "Create access key" for unattended agents, in a modal: this browser derives
 * an agent from a fresh seed, wraps the vault to it and creates it already
 * allowed (no password: the parent is doing it themselves in the unlocked
 * parent area), then shows the key exactly once.
 */
export function AccessKeyDialog({ isOpen, onOpenChange, onCreated }: AccessKeyDialogProps) {
  const t = useTranslations("access");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<AgentScope[]>(() => [...DEFAULT_AGENT_SCOPES]);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(DEFAULT_AGENT_EXPIRY_DAYS);
  const [isCreating, setIsCreating] = useState(false);
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setSelected([...DEFAULT_AGENT_SCOPES]);
    setExpiresInDays(DEFAULT_AGENT_EXPIRY_DAYS);
    setAccessKey(null);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (isCreating) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsCreating(true);
    const outcome = await createAgentAccessKey(accessDeps(), { name: name.trim(), scopes: selected, expiresInDays });
    setIsCreating(false);
    if ("error" in outcome) {
      setError(t(outcome.error === "rate_limited" ? "errorRateLimited" : "keyFailed"));
      return;
    }
    setAccessKey(outcome.key);
    onCreated();
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("keyTitle")}</DialogTitle>
          <DialogDescription>{accessKey ? t("keyCreated") : t("keyDesc")}</DialogDescription>
        </DialogHeader>

        {accessKey ? (
          <div className={cn("flex", access.block, "px-0")}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label={t("keyCreated")}
                value={accessKey}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono"
              />
              <CopyButton text={accessKey} label={t("keyCreated")} />
            </div>
            <p role="note" className={cn("flex items-start gap-1.5", access.warning)}>
              <Icon name="alert" size={16} />
              <span>{t("keyWarning")}</span>
            </p>
            <DialogFooter>
              <Button className="min-h-11" onClick={() => handleOpenChange(false)}>
                {t("keyDone")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={create} className="-mx-6">
            <div className={cn("flex", access.block)}>
              <Label htmlFor="agent-key-name">{t("keyName")}</Label>
              <Input
                id="agent-key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("keyNamePlaceholder")}
                autoComplete="off"
                maxLength={60}
              />
            </div>
            <AgentGrantFields
              idPrefix="key"
              scopes={AGENT_SCOPES}
              selected={selected}
              onSelectedChange={setSelected}
              expiresInDays={expiresInDays}
              onExpiresInDaysChange={setExpiresInDays}
            />
            <div className={cn("flex", access.block)}>
              {error ? (
                <p role="alert" className={access.error}>
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={isCreating}
                  onClick={() => handleOpenChange(false)}
                >
                  {tc("cancel")}
                </Button>
                <Button type="submit" className="min-h-11" disabled={isCreating || !name.trim() || selected.length === 0}>
                  {isCreating ? t("creatingKey") : t("createKey")}
                </Button>
              </DialogFooter>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
