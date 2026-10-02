"use client";

import { Button } from "@/components/ui";

import type { ConvertFailure } from "./convert-server-errors";
import "./offer-convert.css";

interface ConvertErrorBandProps {
  failure: ConvertFailure;
  onRetry: () => void;
}

/**
 * Hata bandı (plan §1): backend `detail` AYNEN. 🔴 `role="alert"` YASAK (repo kuralı) → `role="status"` + `aria-live="polite"`.
 * Yalnız 409 "Veri bütünlüğü hatası" (eşzamanlı proje kodu yarışı; hiçbir şey yazılmadı) "Tekrar dene" sunar.
 */
export function ConvertErrorBand({ failure, onRetry }: ConvertErrorBandProps) {
  return (
    <div className="convert-error" data-testid="convert-error" role="status" aria-live="polite">
      <p className="convert-error__text">{failure.message}</p>
      {failure.kind === "integrity" && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tekrar dene
        </Button>
      )}
    </div>
  );
}
