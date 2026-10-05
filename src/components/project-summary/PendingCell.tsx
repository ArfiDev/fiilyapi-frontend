import type { ReactNode } from "react";

import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { cx } from "@/lib/cx";
import { pendingModuleLabel } from "@/lib/pending-modules";

/**
 * F-PKK T2 · KAYNAĞI OLMAYAN DEĞERİN TEK BASIM NOKTASI.
 *
 * 🔴 K2'nin kuralı: *"'—' BASMAK SESSİZ ATLAMA DEĞİLDİR, ama GEREKÇESİZ '—'
 * ÖYLEDİR."* Bu yüzden gerekçe `title`da SAKLANMAZ — `<title>` yalnız fareyle
 * üzerine gelene görünür, klavye ve dokunmatik kullanıcı hiç göremez.
 * Gerekçe metni EKRANA basılır (F-TH / TreasuryView kanonu).
 *
 * `reason` doğrudan metin olarak DEĞİL, `pendingModuleLabel` üzerinden
 * anahtarla verilir: metnin tek kaynağı `src/lib/pending-modules.ts`tir.
 */
export interface PendingCellProps {
  /** `pending_module` anahtarı — metin `pendingModuleLabel`dan gelir. */
  moduleKey: string;
  /** Gerekçesi haritada olmayan yerel hâller için doğrudan metin. */
  reasonText?: string;
  /** Etiket, gerekçenin hangi öğeye ait olduğunu söyler. */
  label?: ReactNode;
  className?: string;
  /**
   * IZN-F4.2 · zarfın 3. hâli (rolün izni yok): gerekçe "Bu bilgi rolünüz için gizli" + kilit; `moduleKey`in
   * gerekçesi basılmaz (modül vardır, izin yoktur).
   */
  isHidden?: boolean;
}

/** Kaynağı olmayan değerin yerine basılan işaret. Çıplak tire, tipografik değil. */
export const EMPTY_VALUE = "—";

export function PendingCell({ moduleKey, reasonText, label, className, isHidden = false }: PendingCellProps) {
  const reason = isHidden ? HIDDEN_FIELD_HINT : (reasonText ?? pendingModuleLabel(moduleKey));
  return (
    <div className={cx("psum-pending", className)} data-pending-key={moduleKey}>
      {label ? <div className="psum-pending__label">{label}</div> : null}
      <div className="psum-pending__value" aria-hidden="true">
        {EMPTY_VALUE}
        {isHidden && <HiddenMark />}
      </div>
      {/* Gerekçe GÖRÜNÜR metindir; ekran okuyucu da onu okur. */}
      <p className="psum-pending__reason">{reason}</p>
    </div>
  );
}
