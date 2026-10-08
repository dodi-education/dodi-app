"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import {
  FieldRow,
  Row,
  RowMain,
  RowMeta,
  RowTitle,
  StackField,
} from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { PageActions, Section } from "@/components/parent/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { flowErrorText } from "@dodi/client-state/flow-error";
import {
  PERSONA_NAME_MAX_LENGTH,
  cloneNameOf,
  clonePersona,
  deletePersona,
  invalidPersonaFields,
  loadPersona,
  soulFileName,
  updatePersona,
} from "@dodi/client-state/personas";
import { parentFlowDeps } from "@/lib/parent-flow-deps";
import { cn } from "@/lib/utils";
import {
  pageMessage,
  sectionFormError,
  soulActions,
  soulPreview,
  soulTextarea,
} from "@dodi/ui-recipes";
import { useBreadcrumbStore } from "@/stores/breadcrumb-store";

import type { Persona } from "@dodi/types/database";

export default function PersonaDetailPage() {
  const t = useTranslations("personas");
  const tc = useTranslations("common");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [name, setName] = useState("");
  const [soul, setSoul] = useState("");
  const [cloneName, setCloneName] = useState("");
  const [showClone, setShowClone] = useState(false);
  const [invalidName, setInvalidName] = useState(false);
  const [invalidSoul, setInvalidSoul] = useState(false);
  const [invalidCloneName, setInvalidCloneName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Account personas store `name`/`soul` as ciphertext; decrypted for
      // editing. The system default is plaintext and passes through unchanged.
      const persona = await loadPersona(parentFlowDeps(), params.id);
      if (cancelled) return;
      if (!persona) {
        setError(t("notFound"));
        setFetching(false);
        return;
      }
      setPersona(persona);
      setName(persona.name);
      setSoul(persona.soul);
      setFetching(false);
    }
    load();
    return () => { cancelled = true; };
  }, [params.id, t]);

  // Publish the (decrypted, live-edited) name as the breadcrumb leaf — the
  // breadcrumb bar no longer fetches /api/personas for it.
  const setLeaf = useBreadcrumbStore((s) => s.setLeaf);
  useEffect(() => {
    if (persona) setLeaf(name.trim() || null);
    return () => setLeaf(null);
  }, [persona, name, setLeaf]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nextInvalid = invalidPersonaFields({ name, soul });
    if (nextInvalid.name || nextInvalid.soul) {
      setInvalidName(nextInvalid.name);
      setInvalidSoul(nextInvalid.soul);
      return;
    }
    setLoading(true);

    // Seals `name` and `soul` under the account VMK before they leave the
    // browser; kid rows embed the active persona's name, so they refetch.
    try {
      await updatePersona(parentFlowDeps(), params.id, { name, soul });
    } catch (err) {
      setError(
        flowErrorText(err, t("failedToUpdate"), {
          tooLong: t("soulTooLong"),
          vaultLocked: t("failedToUpdate"),
        }),
      );
      setLoading(false);
      return;
    }

    router.push("/parent/companions?tab=personas");
    router.refresh();
  }

  async function handleClone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!cloneName.trim()) {
      setInvalidCloneName(true);
      return;
    }

    setLoading(true);

    // Cloning seals the source soul (the plaintext default, or a decrypted
    // custom one) into a new account-owned persona under this account's VMK.
    try {
      await clonePersona(parentFlowDeps(), { name: cloneName, soul });
    } catch (err) {
      setError(flowErrorText(err, t("failedToClone"), { vaultLocked: t("failedToClone") }));
      setLoading(false);
      return;
    }

    router.push("/parent/companions?tab=personas");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(t("confirmDelete"))) return;

    // Deleting nulls active_persona on referencing kids (FK SET NULL).
    try {
      await deletePersona(parentFlowDeps(), params.id);
    } catch {
      setError(t("failedToDelete"));
      return;
    }
    router.push("/parent/companions?tab=personas");
    router.refresh();
  }

  function handleExport() {
    // Export from the already-decrypted soul in the browser — the server only
    // holds ciphertext for account personas, so it can't produce the .md.
    const blob = new Blob([soul], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = soulFileName(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (fetching) {
    return (
      <div className={cn(pageMessage.web, pageMessage.box)}>
        <p className={pageMessage.text}>{tc("loading")}</p>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className={cn(pageMessage.web, pageMessage.box)}>
        <p className={pageMessage.text}>{t("notFound")}</p>
      </div>
    );
  }

  if (persona.is_system_default) {
    return (
      <div>
        <PageActions>
          <Badge variant="blue">{t("default")}</Badge>
        </PageActions>

        <Section
          title={t("soulLabel")}
          action={
            <div className={cn(soulActions.web, soulActions.box)}>
              <Button variant="outline" size="sm" onClick={handleExport}>
                {t("export")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCloneName(cloneNameOf(persona.name));
                  setShowClone(true);
                }}
              >
                {t("clone")}
              </Button>
            </div>
          }
        >
          <StackField>
            <pre
              className={cn(
                soulPreview.web,
                soulPreview.box,
                soulPreview.tall,
                soulPreview.text,
              )}
            >
              {persona.soul}
            </pre>
          </StackField>

          {error ? (
            <StackField>
              <p className={sectionFormError.text}>{error}</p>
            </StackField>
          ) : null}

          <SaveRow>
            <Button variant="outline" onClick={() => router.back()}>
              {tc("cancel")}
            </Button>
          </SaveRow>
        </Section>

        {showClone ? (
          <Section title={t("clone")}>
            <form onSubmit={handleClone}>
              <FieldRow label={t("cloneNameLabel")} htmlFor="clone-name" required>
                <Input
                  id="clone-name"
                  value={cloneName}
                  onChange={(e) => {
                    setCloneName(e.target.value);
                    if (invalidCloneName) setInvalidCloneName(false);
                  }}
                  aria-invalid={invalidCloneName || undefined}
                  aria-required
                  maxLength={PERSONA_NAME_MAX_LENGTH}
                  className="sm:w-[260px]"
                />
                <Button type="submit" disabled={loading}>
                  {loading ? tc("loading") : t("clone")}
                </Button>
              </FieldRow>
            </form>
          </Section>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleUpdate}>
        <Section title={tc("details")}>
          <FieldRow label={t("nameLabel")} htmlFor="name" required>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (invalidName) setInvalidName(false);
              }}
              aria-invalid={invalidName || undefined}
              aria-required
              maxLength={PERSONA_NAME_MAX_LENGTH}
              className="sm:w-[260px]"
            />
          </FieldRow>
        </Section>

        <Section
          title={t("soulLabel")}
          desc={t("soulHint")}
          required
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExport}
            >
              {t("export")}
            </Button>
          }
        >
          <StackField>
            <textarea
              id="soul"
              value={soul}
              onChange={(e) => {
                setSoul(e.target.value);
                if (invalidSoul) setInvalidSoul(false);
              }}
              aria-invalid={invalidSoul || undefined}
              aria-required
              rows={20}
              className={cn(soulTextarea.web, soulTextarea.box, soulTextarea.text)}
            />
          </StackField>

          {error ? (
            <StackField>
              <p className={sectionFormError.text}>{error}</p>
            </StackField>
          ) : null}

          <SaveRow>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t("saving") : tc("save")}
            </Button>
          </SaveRow>
        </Section>
      </form>

      <Section title={t("dangerZone")}>
        <Row>
          <RowMain>
            <RowTitle>{t("deletePersona")}</RowTitle>
            <RowMeta>{t("dangerZoneDescription")}</RowMeta>
          </RowMain>
          <Button variant="destructive" onClick={handleDelete}>
            <Icon name="delete" size={16} />
            {t("deletePersona")}
          </Button>
        </Row>
      </Section>
    </div>
  );
}
