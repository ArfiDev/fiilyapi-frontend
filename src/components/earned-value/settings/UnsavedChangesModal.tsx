"use client";

import { Modal } from "@/components/settings/Modal";
import { Button } from "@/components/ui/button";
import "./unsaved-changes-modal.css";

import type { SectionName } from "./settings-form";

/**
 * Kaydedilmemiş değişiklik varken şantiye değiştirme uyarısı — Ek:376-398
 * (canlı modal) · Ek:258-282 (M7 b varyantı).
 *
 * §3.10 F0-8: modal KAYDETMEZ — yalnız "Vazgeç" ve "Değişiklikleri at ve geç".
 * Kabuk `settings/Modal`dır (odak tuzağı, Esc, arka plan kilidi); mockup
 * başlığı gövdenin içinde çizer ve × taşımaz — sapma raporda.
 */
export interface UnsavedChangesModalProps {
  fromSiteName: string;
  toSiteName: string;
  sections: readonly SectionName[];
  onCancel: () => void;
  onDiscard: () => void;
}

export function UnsavedChangesModal({
  fromSiteName,
  toSiteName,
  sections,
  onCancel,
  onDiscard,
}: UnsavedChangesModalProps) {
  return (
    <Modal
      title="Kaydedilmemiş değişiklikler var"
      onClose={onCancel}
      className="ev-unsaved-modal"
      footer={
        <>
          {/* Ek:391 */}
          <Button variant="secondary" onClick={onCancel}>
            Vazgeç
          </Button>
          {/* Ek:393 — Onay Kutusu.dc.html:111 kırmızı kenarlı yıkıcı ikincil düğme */}
          <Button variant="secondary" className="ev-unsaved-modal__discard" onClick={onDiscard}>
            Değişiklikleri at ve geç
          </Button>
        </>
      }
    >
      {/* Ek:384 */}
      <p className="ev-unsaved-modal__text">
        {fromSiteName} ayarlarında kaydedilmemiş değişiklik var. Geçiş yapılırsa ({toSiteName}) bu
        değişiklikler kaybolur.
      </p>
      {/* Ek:386-389 — özet ızgarası */}
      <dl className="ev-unsaved-modal__summary">
        <dt>Değişen bölüm</dt>
        <dd className="ev-unsaved-modal__count">{sections.length}</dd>
        <dt>Bölümler</dt>
        <dd>{sections.join(" · ")}</dd>
      </dl>
    </Modal>
  );
}
