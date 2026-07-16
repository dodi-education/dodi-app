"use client";

import { dodi } from "@/lib/api";
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
import { decryptPersona, encryptPersonaFields } from "@dodi/vault";
import { useBreadcrumbStore } from "@/stores/breadcrumb-store";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";

import type { Persona } from "@dodi/types/database";

/** Plaintext soul cap (enforced client-side; the server only sees ciphertext). */
const MAX_SOUL_LENGTH = 50000;

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
      const response = await dodi.request(`/api/personas/${params.id}`);
      if (cancelled) return;
      if (!response.ok) {
        setError(t("notFound"));
        setFetching(false);
        return;
      }
      const data: Persona = await response.json();
      if (cancelled) return;
      // Account personas store `name`/`soul` as ciphertext; decrypt for editing.
      // The system default is plaintext and passes through unchanged.
      const session = useVaultStore.getState().session;
      const persona = session ? decryptPersona(session, data) : data;
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

    const nextInvalid = { name: !name.trim(), soul: !soul.trim() };
    if (nextInvalid.name || nextInvalid.soul) {
      setInvalidName(nextInvalid.name);
      setInvalidSoul(nextInvalid.soul);
      return;
    }
    if (soul.length > MAX_SOUL_LENGTH) {
      setError(t("soulTooLong"));
      return;
    }

    const session = useVaultStore.getState().session;
    if (!session) {
      setError(t("failedToUpdate"));
      return;
    }
    setLoading(true);

    // Seal `name` and `soul` under the account VMK before they leave the browser.
    const response = await dodi.request(`/api/personas/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(encryptPersonaFields(session, { name, soul })),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || t("failedToUpdate"));
      setLoading(false);
      return;
    }

    // Kid rows embed the active persona (name included) — refresh them so
    // glance/list labels pick up the rename.
    useKidStore.getState().invalidate();
    router.push("/parent/personas");
    router.refresh();
  }

  async function handleClone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!cloneName.trim()) {
      setInvalidCloneName(true);
      return;
    }

    const session = useVaultStore.getState().session;
    if (!session) {
      setError(t("failedToClone"));
      return;
    }
    setLoading(true);

    // Cloning seals the source soul (the plaintext default, or a decrypted
    // custom one) into a new account-owned persona under this account's VMK.
    const response = await dodi.request("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(encryptPersonaFields(session, { name: cloneName, soul })),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || t("failedToClone"));
      setLoading(false);
      return;
    }

    router.push("/parent/personas");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(t("confirmDelete"))) return;

    const response = await dodi.request(`/api/personas/${params.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setError(t("failedToDelete"));
      return;
    }

    // Deleting nulls active_persona on referencing kids (FK SET NULL).
    useKidStore.getState().invalidate();
    router.push("/parent/personas");
    router.refresh();
  }

  function handleExport() {
    // Export from the already-decrypted soul in the browser — the server only
    // holds ciphertext for account personas, so it can't produce the .md.
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const blob = new Blob([soul], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug || "persona"}.soul.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t("notFound")}</p>
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
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                {t("export")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCloneName(`${persona.name} (Copy)`);
                  setShowClone(true);
                }}
              >
                {t("clone")}
              </Button>
            </div>
          }
        >
          <StackField>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3.5 font-mono text-xs leading-relaxed text-ink-2">
              {persona.soul}
            </pre>
          </StackField>

          {error ? (
            <StackField>
              <p className="text-sm text-danger">{error}</p>
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
                  maxLength={100}
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
              maxLength={100}
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
              className="min-h-[320px] w-full resize-y rounded-md border border-border-strong bg-card px-3 py-2.5 font-mono text-xs leading-relaxed transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
            />
          </StackField>

          {error ? (
            <StackField>
              <p className="text-sm text-danger">{error}</p>
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
