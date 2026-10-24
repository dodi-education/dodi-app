"use client";

import { useTranslations } from "next-intl";

import { useDateFormat } from "@/components/providers/date-format-provider";
import { Icon } from "@/components/shared/icon";
import { chatMessage } from "@dodi/ui-recipes";
import { cn } from "@/lib/utils";

interface ChatBubbleMetaProps {
  /** When the parent sent it; turns from before timestamps have none. */
  at?: string;
  isRead: boolean;
}

/** Bottom right of the parent's bubble (WhatsApp-style): the time, then the read ticks. */
export function ChatBubbleMeta({ at, isRead }: ChatBubbleMetaProps) {
  const t = useTranslations("gameStudio");
  const { formatMessageTime } = useDateFormat();
  const status = t(isRead ? "readByDodi" : "sentToDodi");
  return (
    <div className={cn(chatMessage.webBubbleMeta, chatMessage.bubbleMeta)}>
      {at && (
        <time dateTime={at} className={chatMessage.stamp}>
          {formatMessageTime(at)}
        </time>
      )}
      <span role="img" aria-label={status} title={status} className="inline-flex">
        <Icon
          name={isRead ? "checks" : "check"}
          size={14}
          stroke={2}
          className={isRead ? "text-primary" : "text-faint"}
        />
      </span>
    </div>
  );
}

/** The time under dodi's reply, ahead of its turn links. */
export function ChatReplyStamp({ at }: { at: string }) {
  const { formatMessageTime } = useDateFormat();
  return (
    <time dateTime={at} className={chatMessage.replyStamp}>
      {formatMessageTime(at)}
    </time>
  );
}
