import { cx } from "@/lib/cx";
import type { PageLevel } from "@/lib/api/models";
import { LEVEL_LABELS, LEVEL_ORDER } from "./page-access-labels";

interface PageLevelSegmentProps {
  /** Seçili düzey; grup başlığındaki "tümü:" seçicide hiçbiri seçili DEĞİLDİR (null). */
  value: PageLevel | null;
  onChange: (level: PageLevel) => void;
  disabled?: boolean;
  "aria-label": string;
  /** row = satır içi (76px düğmeler) · group = grup başlığı "tümü:" (küçük). */
  size?: "row" | "group";
}

/**
 * Görmez / Görür / Düzenler segmenti. Ortak `Segmented` tek tonludur (seçili = beyaz zemin);
 * mockup seçimi düzeye göre boyar (Görmez gri · Görür kehribar · Düzenler yeşil), bu yüzden özelliğe
 * özgü küçük bir bileşendir. Erişilebilirlik emsali `Segmented`: `role="group"` + `aria-pressed`.
 */
export function PageLevelSegment({
  value,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
  size = "row",
}: PageLevelSegmentProps) {
  return (
    <div role="group" aria-label={ariaLabel} className={cx("level-segment", `level-segment--${size}`)}>
      {LEVEL_ORDER.map((level) => {
        const isSelected = level === value;
        return (
          <button
            key={level}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            className={cx(
              "level-segment__item",
              isSelected && "level-segment__item--selected",
              isSelected && `level-segment__item--${level}`,
            )}
            onClick={() => onChange(level)}
          >
            {LEVEL_LABELS[level]}
          </button>
        );
      })}
    </div>
  );
}
