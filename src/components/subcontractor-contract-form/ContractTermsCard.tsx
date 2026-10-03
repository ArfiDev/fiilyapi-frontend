import type { ReactNode } from "react";

import { Checkbox, DateInput, Field, Input, Select } from "@/components/ui";
import { PAYMENT_PERIOD_OPTIONS, type PaymentPeriod } from "@/lib/contract-labels";

import { FSO_TEXT, MAX_LENGTH } from "./constants";
import type { ContractTermsValues } from "./form-state";

// ⚠️ Bu kart PAYLAŞILIR (FSO formu + TSD detayı). Stillerini kendisi
// getirmezse YALNIZ FSO'da doğru görünür — orada
// `SubcontractorContractCreateView` bu iki dosyayı zaten yüklüyor. F-P5
// baseline turunda TSD'de fiilen kartsız, tek kolonlu ve kutucukları tek
// satıra sıkışmış hâlde yakalandı (dört kapı da 5. kapı da GÖRMEZ — stil
// eksikliği DOM'u değiştirmez). Sınıfların kaynağı: `pf-card`/`pf-grid` →
// form-shell, `fso-*` → bu klasörün CSS'i.
import "@/styles/form-shell.css";
import "./subcontractor-contract-form.css";

/**
 * FSO 87-109 · "📝 Sözleşme Şartları" kartı.
 *
 * PAYLAŞILAN BİLEŞEN: T7'nin TSD ekranı aynı kartı DÜZENLENEBİLİR olarak
 * kullanır (spec §5, §7 S3 taşeron ayağı) — bu yüzden bileşen yalnız
 * `ContractTermsValues` bilir; sözleşme kimliği, mutasyon, kaydetme akışı
 * ÇAĞIRANDA kalır. TSD'nin "Kaydet" butonu `headerAside` ile kart başlığının
 * sağına verilir.
 *
 * ⚠️ Şemadaki `vat_pct` alanının mockup'ta ÇİZİLİ BİR KONTROLÜ YOKTUR (107
 * yalnız kutucuk metninde "%20" der) → alan İCAT EDİLMEZ; sunucu varsayılanı
 * (`"20"`) geçerlidir. TSD salt-okunur gösterimi E14 emsaliyle T7'nin işidir.
 */
export type ContractTermsErrors = Partial<Record<keyof ContractTermsValues, string>>;

export interface ContractTermsCardProps {
  values: ContractTermsValues;
  errors?: ContractTermsErrors;
  disabled?: boolean;
  /** Kart başlığının sağına basılan içerik (TSD: "Kaydet"). */
  headerAside?: ReactNode;
  onChange: <K extends keyof ContractTermsValues>(
    field: K,
    value: ContractTermsValues[K],
  ) => void;
}

export function ContractTermsCard({
  values,
  errors = {},
  disabled,
  headerAside,
  onChange,
}: ContractTermsCardProps) {
  return (
    <section className="pf-card" aria-labelledby="fso-terms-card">
      <h2 className="pf-card__title" id="fso-terms-card">
        <span>{FSO_TEXT.termsCard}</span>
        {headerAside}
      </h2>

      {/* 89 — üç sütun */}
      <div className="pf-grid pf-grid--3">
        <Field label="Sözleşme No" required error={errors.contractNo}>
          {(control) => (
            <Input
              {...control}
              className="fso-mono-input"
              maxLength={MAX_LENGTH.contractNo}
              value={values.contractNo}
              disabled={disabled}
              status={errors.contractNo ? "error" : "default"}
              onChange={(event) => onChange("contractNo", event.target.value)}
            />
          )}
        </Field>

        <Field label="İmza Tarihi" required error={errors.signatureDate}>
          {(control) => (
            <DateInput
              {...control}
              value={values.signatureDate}
              disabled={disabled}
              status={errors.signatureDate ? "error" : "default"}
              onValueChange={(iso) => onChange("signatureDate", iso)}
            />
          )}
        </Field>

        {/* 92 — "Hayır"/"Evet" açılırı; şemada boolean. */}
        <Field label="Noter Onaylı">
          {(control) => (
            <Select
              {...control}
              value={values.isNotarized ? "yes" : "no"}
              disabled={disabled}
              onChange={(event) => onChange("isNotarized", event.target.value === "yes")}
            >
              <option value="no">Hayır</option>
              <option value="yes">Evet</option>
            </Select>
          )}
        </Field>

        <Field label="İşe Başlama" required error={errors.startDate}>
          {(control) => (
            <DateInput
              {...control}
              value={values.startDate}
              disabled={disabled}
              status={errors.startDate ? "error" : "default"}
              onValueChange={(iso) => onChange("startDate", iso)}
            />
          )}
        </Field>

        <Field label="Bitiş Tarihi" required error={errors.endDate}>
          {(control) => (
            <DateInput
              {...control}
              value={values.endDate}
              disabled={disabled}
              status={errors.endDate ? "error" : "default"}
              onValueChange={(iso) => onChange("endDate", iso)}
            />
          )}
        </Field>

        <Field label="Gecikme Cezası (₺/gün)" error={errors.latePenaltyDaily}>
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              numeric
              placeholder="5000"
              value={values.latePenaltyDaily}
              disabled={disabled}
              status={errors.latePenaltyDaily ? "error" : "default"}
              onChange={(event) => onChange("latePenaltyDaily", event.target.value)}
            />
          )}
        </Field>
      </div>

      {/* 97 — ince ayırıcı */}
      <div className="fso-divider" />

      {/* 98 — dört sütun */}
      <div className="pf-grid pf-grid--4">
        <Field label="Avans Oranı (%)" error={errors.advancePct}>
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              numeric
              value={values.advancePct}
              disabled={disabled}
              status={errors.advancePct ? "error" : "default"}
              onChange={(event) => onChange("advancePct", event.target.value)}
            />
          )}
        </Field>

        <Field label="Teminat Kesintisi (%)" error={errors.retainagePct}>
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              numeric
              value={values.retainagePct}
              disabled={disabled}
              status={errors.retainagePct ? "error" : "default"}
              onChange={(event) => onChange("retainagePct", event.target.value)}
            />
          )}
        </Field>

        <Field label="Hakediş Periyodu">
          {(control) => (
            <Select
              {...control}
              value={values.paymentPeriod}
              disabled={disabled}
              onChange={(event) =>
                onChange("paymentPeriod", event.target.value as PaymentPeriod)
              }
            >
              {PAYMENT_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Ödeme Vadesi (Gün)" error={errors.paymentTermDays}>
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0}
              step={1}
              numeric
              value={values.paymentTermDays}
              disabled={disabled}
              status={errors.paymentTermDays ? "error" : "default"}
              onChange={(event) => onChange("paymentTermDays", event.target.value)}
            />
          )}
        </Field>
      </div>

      {/* 104-108 — üç kutucuk */}
      <div className="fso-checks">
        <Checkbox
          size="lg"
          checked={values.materialsByContractor}
          disabled={disabled}
          label="Malzeme yükleniciye ait (taşeron sadece işçilik)"
          onChange={(event) => onChange("materialsByContractor", event.target.checked)}
        />
        <Checkbox
          size="lg"
          checked={values.subcontractorFilesOwnSgk}
          disabled={disabled}
          label="Taşeron kendi SGK bildirimini yapar"
          onChange={(event) => onChange("subcontractorFilesOwnSgk", event.target.checked)}
        />
        <Checkbox
          size="lg"
          checked={values.vatWithholding}
          disabled={disabled}
          label="KDV tevkifatı uygulanacak (%20 · Yapı işleri)"
          onChange={(event) => onChange("vatWithholding", event.target.checked)}
        />
      </div>
    </section>
  );
}
