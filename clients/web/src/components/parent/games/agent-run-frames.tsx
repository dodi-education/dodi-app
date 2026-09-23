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
import type { AgentRunFrame } from "@/lib/games/agent-run-log";

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
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {frames.map((frame, i) => (
          <li key={i} className="w-[76px]">
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={t("runLogOpenFrame", { label: frame.label })}
              className="border-border bg-card hover:border-primary focus-visible:ring-ring block min-h-11 w-full overflow-hidden rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none"
            >
              {/* Raw <img>: frames are data URLs (next/image can't optimize them). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={frame.image}
                alt=""
                className="aspect-[4/5] w-full object-cover"
              />
            </button>
            <p className="text-faint mt-0.5 line-clamp-2 text-[10.5px] leading-tight">
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
              className="border-border mx-auto max-h-[70vh] w-auto rounded-md border object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
