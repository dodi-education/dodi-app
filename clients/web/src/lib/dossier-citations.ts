/**
 * Tokenize a memory dossier for display: split the raw markdown into text
 * runs and `[source:<memory_source_id>]` citation markers. Citations are
 * numbered in reading order ([1], [2], …); the same source cited again reuses
 * its number.
 */

export interface DossierTextToken {
  type: "text";
  text: string;
}

export interface DossierCitationToken {
  type: "citation";
  sourceId: string;
  /** 1-based display number, stable per source id. */
  num: number;
}

export type DossierToken = DossierTextToken | DossierCitationToken;

const CITATION_RE = /\s*\[source:([0-9a-f-]{36})\]/gi;

export function tokenizeDossier(dossier: string): DossierToken[] {
  const tokens: DossierToken[] = [];
  const numbers = new Map<string, number>();
  let lastIndex = 0;

  for (const m of dossier.matchAll(CITATION_RE)) {
    if (m.index > lastIndex) {
      tokens.push({ type: "text", text: dossier.slice(lastIndex, m.index) });
    }
    const sourceId = m[1].toLowerCase();
    let num = numbers.get(sourceId);
    if (num === undefined) {
      num = numbers.size + 1;
      numbers.set(sourceId, num);
    }
    tokens.push({ type: "citation", sourceId, num });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < dossier.length) {
    tokens.push({ type: "text", text: dossier.slice(lastIndex) });
  }
  return tokens;
}
