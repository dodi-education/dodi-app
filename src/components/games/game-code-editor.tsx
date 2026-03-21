"use client";

import { useCallback, useEffect, useState } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/themes/prism.css";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";

function highlight(code: string): string {
  return Prism.highlight(code, Prism.languages.markup, "html");
}

interface GameCodeEditorProps {
  code: string;
  gameId: string | null;
  onSave: (newCode: string) => void;
  onClose: () => void;
}

export function GameCodeEditor({ code, gameId, onSave, onClose }: GameCodeEditorProps) {
  const [editedCode, setEditedCode] = useState(code);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = editedCode !== code;

  // Keyboard shortcuts on the container
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (hasChanges) {
          if (!window.confirm("You have unsaved changes. Discard?")) return;
        }
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hasChanges, onClose]);

  const handleSave = useCallback(async () => {
    if (!gameId || saving || !hasChanges) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code_bundle: editedCode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }
      onSave(editedCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [gameId, saving, hasChanges, editedCode, onSave]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold text-dodi-800">Code</span>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-destructive">{error}</span>
          )}
          <Button
            variant="default"
            size="sm"
            disabled={!gameId || !hasChanges || saving}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Icon name="loading" size={14} className="animate-spin" />
            ) : (
              "Save"
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <Icon name="close" size={16} />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto">
        <Editor
          value={editedCode}
          onValueChange={setEditedCode}
          highlight={highlight}
          padding={16}
          tabSize={2}
          insertSpaces
          ignoreTabKey={false}
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 13,
            lineHeight: 1.6,
            minHeight: "100%",
          }}
          onKeyDown={(e) => {
            if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSave();
            }
          }}
        />
      </div>
    </div>
  );
}
