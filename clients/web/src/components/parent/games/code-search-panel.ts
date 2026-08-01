import type { EditorView, Panel, ViewUpdate } from "@codemirror/view";
import { runScopeHandlers } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";

/** Match counting is skipped above this doc size (the counter re-scans the
 *  document on every query/doc/selection change while the panel is open). */
const COUNT_MAX_DOC = 1_000_000;
/** Counting stops here; the counter then shows "999+". */
const COUNT_CAP = 999;

/* Tabler-style inline icons (raw SVG — the panel is framework-less DOM). */
const ICON_CHEVRON_RIGHT = "M9 6l6 6l-6 6";
const ICON_CHEVRON_DOWN = "M6 9l6 6l6 -6";
const ICON_CHEVRON_UP = "M6 15l6 -6l6 6";
const ICON_CLOSE = "M18 6l-12 12M6 6l12 12";

function icon(path: string): string {
  return (
    `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`
  );
}

/** Code queries are not prose: no browser autofill history dropdown, no
 *  spellcheck squiggles, no mobile autocapitalize/autocorrect. */
function disableTextAssists(field: HTMLInputElement): void {
  field.autocomplete = "off";
  field.spellcheck = false;
  field.setAttribute("autocapitalize", "off");
  field.setAttribute("autocorrect", "off");
}

/**
 * VS Code-style search panel for the studio's code editor: a single find row
 * (query field with case/word/regexp toggles, match counter, prev/next,
 * close), expandable via the left chevron into a second row with the replace
 * field and replace/replace-all actions. All strings go through
 * `state.phrase(…)` so the viewer's phrase map translates them. Wired into
 * CodeMirror via `search({ createPanel })`.
 */
export function createStudioSearchPanel(view: EditorView): Panel {
  const phrase = (s: string): string => view.state.phrase(s);
  const spec = getSearchQuery(view.state);

  const searchField = document.createElement("input");
  searchField.value = spec.search;
  searchField.placeholder = phrase("Find");
  searchField.setAttribute("aria-label", phrase("Find"));
  searchField.className = "cm-textfield";
  searchField.name = "search";
  searchField.setAttribute("form", "");
  searchField.setAttribute("main-field", "true");
  disableTextAssists(searchField);

  const replaceField = document.createElement("input");
  replaceField.value = spec.replace;
  replaceField.placeholder = phrase("Replace");
  replaceField.setAttribute("aria-label", phrase("Replace"));
  replaceField.className = "cm-textfield";
  replaceField.name = "replace";
  replaceField.setAttribute("form", "");
  disableTextAssists(replaceField);

  const optButton = (
    label: string,
    ariaPhrase: string,
    initial: boolean,
  ): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cm-search-opt";
    b.textContent = label;
    b.title = phrase(ariaPhrase);
    b.setAttribute("aria-label", phrase(ariaPhrase));
    b.setAttribute("aria-pressed", String(initial));
    b.addEventListener("click", () => {
      b.setAttribute(
        "aria-pressed",
        String(b.getAttribute("aria-pressed") !== "true"),
      );
      commit();
      searchField.focus();
    });
    return b;
  };
  const caseOpt = optButton("Aa", "match case", spec.caseSensitive);
  const wordOpt = optButton("W", "by word", spec.wholeWord);
  const reOpt = optButton(".*", "regexp", spec.regexp);
  const pressed = (b: HTMLButtonElement): boolean =>
    b.getAttribute("aria-pressed") === "true";

  const iconButton = (
    name: string,
    ariaPhrase: string,
    iconPath: string,
    onClick: () => void,
  ): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.name = name;
    b.className = "cm-search-btn";
    b.innerHTML = icon(iconPath);
    b.title = phrase(ariaPhrase);
    b.setAttribute("aria-label", phrase(ariaPhrase));
    b.addEventListener("click", onClick);
    return b;
  };

  const count = document.createElement("span");
  count.className = "cm-search-count";

  const currentQuery = (): SearchQuery =>
    new SearchQuery({
      search: searchField.value,
      caseSensitive: pressed(caseOpt),
      wholeWord: pressed(wordOpt),
      regexp: pressed(reOpt),
      replace: replaceField.value,
    });

  // "k of n" (capped), "no results", or empty while the query is empty or the
  // doc is too big to re-scan continuously.
  const updateCount = (): void => {
    const query = currentQuery();
    if (
      !query.search ||
      !query.valid ||
      view.state.doc.length > COUNT_MAX_DOC
    ) {
      count.textContent = "";
      return;
    }
    const { from, to } = view.state.selection.main;
    let total = 0;
    let current = 0;
    const cursor = query.getCursor(view.state);
    for (let m = cursor.next(); !m.done && total <= COUNT_CAP; m = cursor.next()) {
      total++;
      if (m.value.from === from && m.value.to === to) current = total;
    }
    if (total === 0) {
      count.textContent = phrase("no results");
      return;
    }
    const totalLabel = total > COUNT_CAP ? `${COUNT_CAP}+` : String(total);
    count.textContent = current
      ? `${current} ${phrase("of")} ${totalLabel}`
      : totalLabel;
  };

  const commit = (): void => {
    const query = currentQuery();
    if (!query.eq(getSearchQuery(view.state))) {
      view.dispatch({ effects: setSearchQuery.of(query) });
    }
    updateCount();
  };

  const findRow = document.createElement("div");
  findRow.className = "cm-search-row";
  const fieldWrap = document.createElement("div");
  fieldWrap.className = "cm-search-field-wrap";
  fieldWrap.append(searchField, caseOpt, wordOpt, reOpt);
  findRow.append(
    fieldWrap,
    count,
    iconButton("prev", "previous", ICON_CHEVRON_UP, () => {
      findPrevious(view);
      updateCount();
    }),
    iconButton("next", "next", ICON_CHEVRON_DOWN, () => {
      findNext(view);
      updateCount();
    }),
    iconButton("close", "close", ICON_CLOSE, () => closeSearchPanel(view)),
  );

  const textButton = (
    name: string,
    labelPhrase: string,
    onClick: () => void,
  ): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.name = name;
    b.className = "cm-button";
    b.textContent = phrase(labelPhrase);
    b.addEventListener("click", onClick);
    return b;
  };

  const replaceRow = document.createElement("div");
  replaceRow.className = "cm-search-row";
  replaceRow.hidden = true;
  replaceRow.append(
    replaceField,
    textButton("replace", "replace", () => {
      replaceNext(view);
      updateCount();
    }),
    textButton("replaceAll", "replace all", () => {
      replaceAll(view);
      updateCount();
    }),
  );

  // The VS Code-style mode toggle: chevron collapses/expands the replace row.
  const expand = document.createElement("button");
  expand.type = "button";
  expand.className = "cm-search-expand";
  expand.innerHTML = icon(ICON_CHEVRON_RIGHT);
  expand.title = phrase("Toggle replace");
  expand.setAttribute("aria-label", phrase("Toggle replace"));
  expand.setAttribute("aria-expanded", "false");
  expand.addEventListener("click", () => {
    const open = replaceRow.hidden;
    replaceRow.hidden = !open;
    expand.setAttribute("aria-expanded", String(open));
    expand.innerHTML = icon(open ? ICON_CHEVRON_DOWN : ICON_CHEVRON_RIGHT);
    (open ? replaceField : searchField).focus();
  });

  const rows = document.createElement("div");
  rows.className = "cm-search-rows";
  rows.append(findRow, replaceRow);

  const dom = document.createElement("div");
  dom.className = "cm-search";
  dom.append(expand, rows);

  dom.addEventListener("keydown", (e: KeyboardEvent) => {
    // Scoped keymaps first (Escape → close, Mod+F → reselect field, …).
    if (runScopeHandlers(view, e, "search-panel")) {
      e.preventDefault();
    } else if (e.key === "Enter" && e.target === searchField) {
      e.preventDefault();
      (e.shiftKey ? findPrevious : findNext)(view);
      updateCount();
    } else if (e.key === "Enter" && e.target === replaceField) {
      e.preventDefault();
      replaceNext(view);
      updateCount();
    }
  });
  const commitOnInput = (e: Event): void => {
    if (e.target === searchField || e.target === replaceField) commit();
  };
  dom.addEventListener("input", commitOnInput);

  return {
    dom,
    top: true,
    mount() {
      searchField.select();
      updateCount();
    },
    update(update: ViewUpdate) {
      // Doc edits and find/replace jumps move matches under the counter.
      if (update.docChanged || update.selectionSet) updateCount();
    },
  };
}
