"use client";

import { useState } from "react";

import { pctToInputText } from "@/components/offers/offer-form";
import { Input } from "@/components/ui";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { formatTemplateRates, parseTemplateRates, ratesDiffer, type RateDefaults } from "./template-rates";
import type { TemplatePatch } from "./useTemplateContentEditor";

/** Yüzde kutularında izin verilen karakterler (OfferRateFields ile aynı: noktalı girdi doğrulamada reddedilir, silinmez). */
const NOT_PCT_CHAR = /[^\d.,]/g;

interface TemplateRatesStatProps {
  overhead: string | null;
  profit: string | null;
  defaults: RateDefaults | null;
  canEdit: boolean;
  onSave: (fields: TemplatePatch) => void;
}

interface Draft {
  overhead: string;
  profit: string;
  /** Taslak AÇILIRKEN görülen sunucu değerleri: değişiklik buna göre ölçülür (arada başkası değiştirdiyse ezilmez). */
  initialOverhead: string | null;
  initialProfit: string | null;
}

/** TS:326 "Varsayılan oranlar" kartı; yazarken ÜS-F4-7: tıklanınca iki yüzde kutusu, odak kartı terk edince PATCH. */
export function TemplateRatesStat({ overhead, profit, defaults, canEdit, onSave }: TemplateRatesStatProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<"overhead" | "profit", string>>>({});
  // Oranlar açıkken (kart terk edilince kaydedilir) çıkış onayı: yazılan değer kaybolmasın.
  useUnsavedChanges(draft !== null, "Varsayılan oranlar");

  if (draft === null) {
    const value = formatTemplateRates(overhead, profit, defaults);
    const body = (
      <>
        <span className="otpl-stat__label">Varsayılan oranlar</span>
        <span className="otpl-stat__value">{value}</span>
      </>
    );
    if (!canEdit) return <div className="otpl-stat">{body}</div>;
    return (
      <button
        type="button"
        className="otpl-stat"
        title="Varsayılan oranları düzenle"
        onClick={() => {
          setErrors({});
          setDraft({
            overhead: overhead === null ? "" : pctToInputText(overhead),
            profit: profit === null ? "" : pctToInputText(profit),
            initialOverhead: overhead,
            initialProfit: profit,
          });
        }}
      >
        {body}
      </button>
    );
  }

  function commit(current: Draft) {
    const parsed = parseTemplateRates(current.overhead, current.profit);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setDraft(null);
    const changed: TemplatePatch = {
      // YALNIZ kullanıcının değiştirdiği alan: dokunulmayan alan sunucudaki (belki başkasının) değerinde kalır.
      ...(ratesDiffer(parsed.overhead, current.initialOverhead) ? { overhead_pct: parsed.overhead } : {}),
      ...(ratesDiffer(parsed.profit, current.initialProfit) ? { profit_pct: parsed.profit } : {}),
    };
    if (Object.keys(changed).length > 0) onSave(changed);
  }

  return (
    <div
      className="otpl-stat"
      onBlur={(event) => {
        // Odak iki kutu arasında geçerken kaydetme; kartı terk edince kaydet.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit(draft);
      }}
    >
      <span className="otpl-stat__label">Varsayılan oranlar</span>
      <div className="otpl-stat__edit">
        {(
          [
            ["overhead", "Genel gider"],
            ["profit", "Kâr"],
          ] as const
        ).map(([field, label]) => (
          <div className="otpl-stat__edit-field" key={field}>
            <Input
              size="row"
              numeric
              inputMode="decimal"
              autoFocus={field === "overhead"}
              aria-label={`Varsayılan ${label} %`}
              value={draft[field]}
              status={errors[field] ? "error" : "default"}
              rightIcon={<span aria-hidden="true">%</span>}
              onChange={(event) => setDraft({ ...draft, [field]: event.target.value.replace(NOT_PCT_CHAR, "") })}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit(draft);
                if (event.key === "Escape") setDraft(null);
              }}
            />
            {errors[field] && <span className="otpl-detail__field-error">{errors[field]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
