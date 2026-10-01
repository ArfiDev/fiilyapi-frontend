"use client";

import { Button } from "@/components/ui";

export interface WorkItemPickerFooterProps {
  /** Altbilgi kırmızı bandı (PS:203-209): yalnız hata varken; satırlar ayrı satır basılır. */
  bandLines: readonly string[];
  selectedCount: number;
  /** "₺1.234,56" ya da "—". */
  totalText: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  /** Verilirse altbilgi solunda ikincil bağlantı (ÜS-F2-1). */
  onManualAdd?: () => void;
}

/** PS:203-221 — hata bandı · Seçili Poz · Eklenecek Tutar · Vazgeç · "N Pozu Ekle". */
export function WorkItemPickerFooter({
  bandLines,
  selectedCount,
  totalText,
  isSubmitting,
  canSubmit,
  onSubmit,
  onCancel,
  onManualAdd,
}: WorkItemPickerFooterProps) {
  const submitLabel = isSubmitting ? "Ekleniyor…" : selectedCount > 0 ? `${selectedCount} Pozu Ekle` : "Poz Ekle";
  return (
    <div className="wip-footer">
      {bandLines.length > 0 && (
        <div className="wip-band" data-testid="wip-band" aria-live="polite">
          {bandLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
      <div className="wip-footer__row">
        {onManualAdd && (
          <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={onManualAdd}>
            Katalogda yok mu? Elle poz ekle
          </Button>
        )}
        <span className="wip-footer__stat wip-footer__stat--first">
          Seçili Poz <strong data-testid="wip-selected">{selectedCount}</strong>
        </span>
        <span className="wip-footer__stat">
          Eklenecek Tutar <strong data-testid="wip-total">{totalText}</strong>
        </span>
        <Button variant="secondary" disabled={isSubmitting} onClick={onCancel}>
          Vazgeç
        </Button>
        <Button variant="primary" disabled={!canSubmit} onClick={onSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
