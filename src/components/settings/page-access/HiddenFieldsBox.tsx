import { Checkbox } from "@/components/ui";
import { cx } from "@/lib/cx";
import type { HiddenCategory } from "@/lib/api/models";
import { HIDDEN_CATEGORIES, HIDDEN_FIELDS_INACTIVE_NOTE } from "./page-access-labels";

interface HiddenFieldsBoxProps {
  hidden: readonly HiddenCategory[];
  /** Backend gizleme maskesini uyguluyor mu (`hidden_fields_effective`); değilse tek satır not basılır. */
  isEffective: boolean;
  disabled: boolean;
  onToggle: (category: HiddenCategory) => void;
}

/** 6 hassas alan kutucuğu: işaretli alan bu rol için her yerde gizlenir. */
export function HiddenFieldsBox({ hidden, isEffective, disabled, onToggle }: HiddenFieldsBoxProps) {
  return (
    <section className="hidden-fields" aria-label="Hassas alanlar">
      <div className="hidden-fields__head">
        <h2 className="hidden-fields__title">Hassas alanlar</h2>
        <span className="hidden-fields__sub">İşaretli alan bu rol için her yerde gizlenir</span>
      </div>
      <div className="hidden-fields__grid">
        {HIDDEN_CATEGORIES.map((info) => {
          const checked = hidden.includes(info.key);
          return (
            <label key={info.key} className={cx("hidden-card", checked && "hidden-card--checked")}>
              <Checkbox checked={checked} disabled={disabled} onChange={() => onToggle(info.key)} />
              <span>
                <span className="hidden-card__title">{info.title}</span>
                <span className="hidden-card__hint">{info.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
      {!isEffective && <p className="hidden-fields__note">{HIDDEN_FIELDS_INACTIVE_NOTE}</p>}
    </section>
  );
}
