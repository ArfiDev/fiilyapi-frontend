"use client";

import { Checkbox, DateInput, Field, Input, Select } from "@/components/ui";
import { LockIcon } from "@/components/ui/icons";
import { PRICE_INDEX_OPTIONS, type PriceIndexType } from "@/lib/contract-labels";
import { durationDays } from "@/lib/form/derive";

import { upperTr } from "./convert-format";
import type { ConvertForm } from "./convert-types";
import type { Step1Errors } from "./convert-validate";
import "./offer-convert.css";

export type ConvertFormChange = <K extends keyof ConvertForm>(field: K, value: ConvertForm[K]) => void;

interface ConvertProjectStepProps {
  form: ConvertForm;
  /** Görünür hatalar (yerel doğrulama "ileri" sonrası + sunucu alan hataları). */
  errors: Step1Errors;
  employerName: string;
  /** Tarihler teklif koşullarından geldiği gibi mi (kullanıcı değiştirmediyse "teklif koşullarından" notu basılır). */
  isDatesFromOffer: boolean;
  onChange: ConvertFormChange;
}

const statusOf = (message: string | undefined) => (message ? "error" : "default");

/** TDN:27-66 — "Proje bilgileri" kartı (+ EK: il/ilçe, fiyat farkı — backend zorunlu, mockup'ta yok; ÜS-F5-8/9). */
export function ConvertProjectStep({ form, errors, employerName, isDatesFromOffer, onChange }: ConvertProjectStepProps) {
  return (
    <section className="convert-card" data-testid="convert-step-1" aria-labelledby="convert-step-1-title">
      <div>
        <h2 className="convert-card__title" id="convert-step-1-title">
          Proje bilgileri
        </h2>
        <p className="convert-card__sub">Teklif bilgilerinden önceden dolduruldu</p>
      </div>
      <div className="convert-grid">
        <Field label="Proje adı" required error={errors.projectName} className="convert-grid__full">
          {(control) => (
            <Input {...control} value={form.projectName} status={statusOf(errors.projectName)} onChange={(e) => onChange("projectName", e.target.value)} />
          )}
        </Field>
        <Field label="Proje kodu" hint="Boş bırakılırsa otomatik" error={errors.projectCode}>
          {(control) => (
            <Input
              {...control}
              numeric
              value={form.projectCode}
              placeholder="PRJ-2026-005"
              status={statusOf(errors.projectCode)}
              onChange={(e) => onChange("projectCode", e.target.value)}
              onBlur={(e) => onChange("projectCode", upperTr(e.target.value))}
            />
          )}
        </Field>
        <EmployerField name={employerName} />
        <Field label="Sözleşme no" required error={errors.contractNo}>
          {(control) => (
            <Input
              {...control}
              numeric
              value={form.contractNo}
              placeholder="SZL-2026-005"
              status={statusOf(errors.contractNo)}
              onChange={(e) => onChange("contractNo", e.target.value)}
              onBlur={(e) => onChange("contractNo", upperTr(e.target.value))}
            />
          )}
        </Field>
        <Field label="Sözleşme tarihi" required error={errors.signatureDate}>
          {(control) => (
            <DateInput {...control} value={form.signatureDate} status={statusOf(errors.signatureDate)} onValueChange={(iso) => onChange("signatureDate", iso)} />
          )}
        </Field>
        <DatesField form={form} errors={errors} isFromOffer={isDatesFromOffer} onChange={onChange} />
        <Field label="İl / İlçe" required error={errors.city}>
          {(control) => (
            <Input {...control} value={form.city} placeholder="Çankaya / Ankara" status={statusOf(errors.city)} onChange={(e) => onChange("city", e.target.value)} />
          )}
        </Field>
      </div>
      <EscalationBlock form={form} errors={errors} onChange={onChange} />
      <SiteBlock form={form} errors={errors} onChange={onChange} />
    </section>
  );
}

function EmployerField({ name }: { name: string }) {
  return (
    <div className="convert-fieldgroup">
      <span className="convert-fieldgroup__label">İşveren</span>
      <div className="convert-locked">
        <LockIcon aria-hidden="true" />
        {name}
      </div>
      <p className="convert-hint">Tekliften gelir · değiştirilemez</p>
    </div>
  );
}

interface BlockProps {
  form: ConvertForm;
  errors: Step1Errors;
  onChange: ConvertFormChange;
}

/** "Başlangıç / bitiş" (TDN:52-60): iki tarih kutusu + uç-dahil süre notu. */
function DatesField({ form, errors, isFromOffer, onChange }: BlockProps & { isFromOffer: boolean }) {
  const days = durationDays(form.startDate, form.endDate);
  return (
    <div className="convert-fieldgroup" role="group" aria-labelledby="convert-dates-label">
      <span className="field__label-row">
        <span className="field__label" id="convert-dates-label">
          Başlangıç / bitiş
        </span>
        <span className="field__req" aria-hidden="true">
          *
        </span>
      </span>
      <div className="convert-dates">
        <DateInput
          aria-label="Başlangıç tarihi"
          value={form.startDate}
          status={statusOf(errors.startDate)}
          onValueChange={(iso) => onChange("startDate", iso)}
        />
        <span aria-hidden="true">→</span>
        <DateInput aria-label="Bitiş tarihi" value={form.endDate} status={statusOf(errors.endDate)} onValueChange={(iso) => onChange("endDate", iso)} />
      </div>
      {days !== null && <p className="convert-hint">{isFromOffer ? `${days} takvim günü · teklif koşullarından` : `${days} takvim günü`}</p>}
      {errors.startDate && <p className="convert-error-text">{errors.startDate}</p>}
      {errors.endDate && <p className="convert-error-text">{errors.endDate}</p>}
    </div>
  );
}

/** Fiyat farkı (ÜS-F5-9): `ContractCard` kalıbı; kapalıyken endeks alanları DOM'dan kalkar. */
function EscalationBlock({ form, errors, onChange }: BlockProps) {
  return (
    <div className="convert-escalation">
      <Checkbox label="Fiyat farkı uygulanacak" checked={form.hasPriceEscalation} onChange={(e) => onChange("hasPriceEscalation", e.target.checked)} />
      {form.hasPriceEscalation && (
        <div className="convert-grid">
          <Field label="Endeks Tipi" required error={errors.indexType}>
            {(control) => (
              <Select {...control} value={form.indexType} status={statusOf(errors.indexType)} onChange={(e) => onChange("indexType", e.target.value as PriceIndexType | "")}>
                <option value="">Seçiniz…</option>
                {PRICE_INDEX_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Baz Endeks Değeri (D0)" required error={errors.baseIndexValue}>
            {(control) => (
              <Input {...control} numeric value={form.baseIndexValue} placeholder="1.000" status={statusOf(errors.baseIndexValue)} onChange={(e) => onChange("baseIndexValue", e.target.value)} />
            )}
          </Field>
        </div>
      )}
    </div>
  );
}

const SITE_DESCRIPTION = "Bütün sözleşme kalemleri bu şantiyeye bağlanır. Sonradan blok ekleyip kalemleri bölebilirsiniz.";

/** "Tek şantiye aç: {ad}" (TDN:62-65, ÜS-F5-11): ad kutusu boşken proje adı (backend varsayılanı). */
function SiteBlock({ form, errors, onChange }: BlockProps) {
  const siteName = form.siteName.trim() || form.projectName.trim();
  return (
    <div className={form.openSite ? "convert-site convert-site--on" : "convert-site"}>
      <Checkbox
        checked={form.openSite}
        onChange={(e) => onChange("openSite", e.target.checked)}
        label={
          <>
            <span className="convert-site__title">Tek şantiye aç: {siteName}</span>
            <span className="convert-site__desc">{SITE_DESCRIPTION}</span>
          </>
        }
      />
      {form.openSite && (
        <Field label="Şantiye adı" error={errors.siteName}>
          {(control) => (
            <Input {...control} value={form.siteName} placeholder={form.projectName} status={statusOf(errors.siteName)} onChange={(e) => onChange("siteName", e.target.value)} />
          )}
        </Field>
      )}
    </div>
  );
}
