"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AgentRunFrame } from "@dodi/studio/agent-run-log";
import { agentRunFrames } from "@dodi/ui-recipes";
import { cn } from "@/lib/utils";

interface AgentRunFramesProps {
  frames: AgentRunFrame[];
}

/**
 * The frames one screenshot check captured, as labelled thumbnails. A click
 * opens the frame large (the full capture while it is still in this session,
 * the kept thumbnail after a reload).
 */
export function AgentRunFrames({ frames }: AgentRunFramesProps) {
  const t = useTranslations("gameStudio");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex === null ? null : frames[openIndex];

  return (
    <>
      <ul className={cn(agentRunFrames.webList, agentRunFrames.list)}>
        {frames.map((frame, i) => (
          <li key={i} className={agentRunFrames.item}>
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={t("runLogOpenFrame", { label: frame.label })}
              className={cn(agentRunFrames.button, agentRunFrames.webButton)}
            >
              {/* Raw <img>: frames are data URLs (next/image can't optimize them). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={frame.image}
                alt=""
                className={cn(agentRunFrames.image, agentRunFrames.webImage)}
              />
            </button>
            <p className={cn(agentRunFrames.label, agentRunFrames.webLabel)}>
              {frame.label}
            </p>
          </li>
        ))}
      </ul>
      <Dialog
        open={open !== null}
        onOpenChange={(isOpen) => !isOpen && setOpenIndex(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("runLogFrameTitle")}</DialogTitle>
            <DialogDescription>{open?.label}</DialogDescription>
          </DialogHeader>
          {open && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={open.fullImage ?? open.image}
              alt={open.label}
              className={cn(agentRunFrames.large, agentRunFrames.webLarge)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
