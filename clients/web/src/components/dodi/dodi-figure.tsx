"use client";

import Image from "next/image";

import { getDodiImage } from "@/lib/dodi-image";
import { use3dPreference } from "@/stores/account-store";
import type { DodiState } from "@/stores/dodi-session-store";

import { DodiCharacter3d } from "./dodi-character-3d";

export interface DodiFigureProps {
  state: DodiState;
  /** Mid-activity (thinking, creating a picture, writing). */
  isThinking?: boolean;
  /** The round head-only avatar (32px) instead of the full-body mascot. */
  isHead?: boolean;
  /** This view shows the 3D character when the account has it on (for now: /home). */
  canRender3d?: boolean;
  alt: string;
  className?: string;
  priority?: boolean;
}

/**
 * dodi as the 3D character or the 2D artwork, per the account's Interface
 * setting (Settings > General) and whether the view supports 3D yet; a view
 * that can show 3D decides before showing either (DodiCharacter3d). The head
 * is always 2D. Full-body figures fill their parent box.
 */
export function DodiFigure(props: DodiFigureProps) {
  const is3dEnabled = use3dPreference();
  const image = <DodiImage2d {...props} />;
  const canShow3d = props.canRender3d === true && !props.isHead;
  return canShow3d ? <DodiCharacter3d {...props} is3dEnabled={is3dEnabled} fallback={image} /> : image;
}

function DodiImage2d({ state, isThinking, isHead, alt, className, priority }: DodiFigureProps) {
  if (isHead) {
    return (
      <Image
        src={isThinking ? "/images/dodi-head-thinking.png" : getDodiImage(state, true)}
        alt={alt}
        width={32}
        height={32}
        className={className}
        priority={priority}
      />
    );
  }
  return (
    <Image
      src={isThinking ? "/images/dodi-thinking.png" : getDodiImage(state, false)}
      alt={alt}
      fill
      sizes="300px"
      className={className}
      priority={priority}
    />
  );
}
