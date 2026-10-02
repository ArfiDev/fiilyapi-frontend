"use client";

import type { ReactNode } from "react";

import { inlineSymbolProps } from "@/components/ui/icons";

export interface OfferResetButtonProps {
  /** "kat. 1,80" · "genel" — mockup'taki "↺" yerine geri-al oku SVG olarak basılır. */
  children: ReactNode;
  title?: string;
  onClick: () => void;
}

/**
 * TD:252, 377 — "↺ kat. x" / "↺ genel" geri dönüş düğmesi. `↺` (U+21BA) yazı tipi alt kümesi DIŞIDIR
 * (`symbol-subset-guard`) → ok inline SVG'dir (F-SEM kanonu); düğmenin erişilebilir adı yalnız metindir.
 */
export function OfferResetButton({ children, title, onClick }: OfferResetButtonProps) {
  return (
    <button type="button" className="oit-reset" title={title} onClick={onClick}>
      <svg
        {...inlineSymbolProps}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </svg>
      {children}
    </button>
  );
}
