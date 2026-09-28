"use client";

import { useState } from "react";

import { Modal } from "@/components/settings/Modal";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { Button, Field, Input, Select } from "@/components/ui";
import { DateInput } from "@/components/ui/date-input";
import { CheckCircleIcon, WarningTriangleIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  BANK_ACCOUNT_LIST_MAX_LIMIT,
  useBankAccounts,
} from "@/lib/api/hooks/useBankAccounts";
import { useCreateFinancialInstrument } from "@/lib/api/hooks/useFinancialInstrumentMutations";
import { PROJECT_LIST_MAX_LIMIT, useProjects } from "@/lib/api/hooks/useProjects";

import {
  BANK_NAME_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  DRAWER_NAME_MAX_LENGTH,
  EMPTY_INSTRUMENT_FORM,
  INSTRUMENT_DIRECTION_OPTIONS,
  INSTRUMENT_KIND_OPTIONS,
  SERIAL_NO_MAX_LENGTH,
  amountError,
  buildInstrumentCreateBody,
  dueDateError,
  instrumentCompositionLabel,
  instrumentFormBlockReason,
  lengthError,
  type InstrumentFormValues,
} from "./financial-instrument-form";
import {
  INSTRUMENT_FORM_AMOUNT_LABEL,
  INSTRUMENT_FORM_BANK_ACCOUNT_HINT,
  INSTRUMENT_FORM_BANK_ACCOUNT_LABEL,
  INSTRUMENT_FORM_BANK_HINT,
  INSTRUMENT_FORM_BANK_LABEL,
  INSTRUMENT_FORM_CANCEL_LABEL,
  INSTRUMENT_FORM_COMPOSITION_LABEL,
  INSTRUMENT_FORM_COMPOSITION_NOTE,
  INSTRUMENT_FORM_DESCRIPTION_HINT,
  INSTRUMENT_FORM_DESCRIPTION_LABEL,
  INSTRUMENT_FORM_DIRECTION_LABEL,
  INSTRUMENT_FORM_DRAWER_HINT,
  INSTRUMENT_FORM_DRAWER_LABEL,
  INSTRUMENT_FORM_DUE_LABEL,
  INSTRUMENT_FORM_ERROR_FALLBACK,
  INSTRUMENT_FORM_ISSUE_LABEL,
  INSTRUMENT_FORM_KIND_LABEL,
  INSTRUMENT_FORM_LEAD,
  INSTRUMENT_FORM_OPTIONAL_TITLE,
  INSTRUMENT_FORM_PROJECT_LABEL,
  INSTRUMENT_FORM_PROJECT_PLACEHOLDER,
  INSTRUMENT_FORM_SELECT_PLACEHOLDER,
  INSTRUMENT_FORM_SERIAL_HINT,
  INSTRUMENT_FORM_STATUS_NOTE_BODY,
  INSTRUMENT_FORM_STATUS_NOTE_TITLE,
  INSTRUMENT_FORM_SUBMIT_LABEL,
  INSTRUMENT_FORM_SERIAL_LABEL,
  INSTRUMENT_FORM_TITLE,
} from "./financial-instrument-labels";
import "./financial-instruments.css";

/**
 * F-CEK · **YENİ ÇEK / SENET** diyaloğu — uç: `POST /financial-instruments`.
 * Kanonik mockup: `projedesign/Form - Cek Ekle.dc.html` ("FCE"); yorumlardaki
 * `FCE:n` O dosyanın SATIR numaralarıdır.
 *
 * 🔴 FCE:39 (KARAR 1) modal der, ayrı sayfa DEĞİL — akış "listede çalışırken
 * hızlı kayıt". Kabuk `settings/Modal`dır (ortak yüzey), YENİ kabuk yazılmaz.
 *
 * 🔴 **YÖNETİM DENETİMİNİN ÖLÇTÜĞÜ İKİ SAPMA UYGULANDI:**
 *   1. FCE:162-170 bankayı SABİT listeli `<select>` çizer; sözleşmede
 *      `bank_name` **serbest metindir** (`string`, `maxLength: 100` — `enum`
 *      YOK). Kapalı liste basılsaydı, listede olmayan bankayla çalışan
 *      kullanıcı kaydı hiç yazamazdı → **serbest metin** basıldı.
 *   2. FCE:185 açıklama alanının **≤200** sınırını ekranda YAZMAZ (öteki
 *      alanların `.hint`i sınırı yazar) → ipucu EKLENDİ.
 *
 * 🔴 **DURUM ALANI YOKTUR ve EKLENMEZ** (FCE:48, FCE:174-182): şema
 * `additionalProperties: false`tır, `status` gövdeye girerse **422**. Mockup
 * bunu DOĞRU yapmış.
 */
export interface InstrumentFormModalProps {
  onClose: () => void;
}

/**
 * 🔴 Başarıdan sonra ekran AYRI bir tazeleme yapmaz: liste ve özet kartları
 * mutasyon hook'unun `onSuccess`inde geçersizleşir. İkinci bir tazeleme yolu
 * bırakmak ikisinin sessizce ayrışmasına yol açardı.
 */
export function InstrumentFormModal({ onClose }: InstrumentFormModalProps) {
  const createInstrument = useCreateFinancialInstrument();
  const [values, setValues] = useState<InstrumentFormValues>(EMPTY_INSTRUMENT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  // SEKME-F1.3b — tüm alanlar string/enum; taban sabit `EMPTY_INSTRUMENT_FORM`la kıyaslanır.
  const isDirty = JSON.stringify(values) !== JSON.stringify(EMPTY_INSTRUMENT_FORM);
  // Kayıt 50/ortak emir §7 — `Modal`a `isDirty` VERİLMEZ; doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Çek/senet formu");

  // FCE:171-183 — iki opsiyonel seçicinin kaynakları. Kırpma korkuluğu (TB3):
  // tavan AÇIKÇA gönderilir, sessizce kırpılmaz.
  const projectsQuery = useProjects({ limit: PROJECT_LIST_MAX_LIMIT });
  const accountsQuery = useBankAccounts({ isActive: true, limit: BANK_ACCOUNT_LIST_MAX_LIMIT });

  const isPending = createInstrument.isPending;
  const blockReason = instrumentFormBlockReason(values);
  const dueError = dueDateError(values.issueDate, values.dueDate);

  function patch(next: Partial<InstrumentFormValues>) {
    setValues((current) => ({ ...current, ...next }));
    setFormError(null);
  }

  async function handleSubmit() {
    if (blockReason !== undefined) return;
    setFormError(null);
    try {
      await createInstrument.mutateAsync(buildInstrumentCreateBody(values));
    } catch (error) {
      setFormError(backendErrorMessage(error, INSTRUMENT_FORM_ERROR_FALLBACK));
      return;
    }
    onClose();
  }

  return (
    <Modal
      title={INSTRUMENT_FORM_TITLE}
      className="fin-modal"
      onClose={onClose}
      footer={
        <>
          {/* FCE:196 — "neden kaydedilemiyor" satırı KURALDAN TÜRER, elle
              yazılmaz: kural değişirse metin kendiliğinden düşer. */}
          {blockReason !== undefined && (
            <span className="fin-form__footer-note" data-testid="fin-form-block-reason">
              <WarningTriangleIcon className="fin-form__footer-icon" />
              {blockReason}
            </span>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {INSTRUMENT_FORM_CANCEL_LABEL}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={blockReason !== undefined || isPending}
            data-testid="fin-form-submit"
          >
            {INSTRUMENT_FORM_SUBMIT_LABEL}
          </Button>
        </>
      }
    >
      {/* FCE:76 — başlık altındaki alt satır. Kabuk başlığı TEK satırdır ve
          DEĞİŞTİRİLMEZ (ortak yüzey, başka dilimlerin kareleri ona bağlı). */}
      <p className="fin-form__lead" data-testid="fin-form-lead">
        {INSTRUMENT_FORM_LEAD}
      </p>

      {/* FCE:103-118 — Tür ve Yön İKİ AYRI segment. */}
      <div className="fin-form__grid">
        <SegmentField
          label={INSTRUMENT_FORM_KIND_LABEL}
          testId="fin-form-kind"
          options={INSTRUMENT_KIND_OPTIONS}
          value={values.kind}
          disabled={isPending}
          onSelect={(kind) => patch({ kind })}
        />
        <SegmentField
          label={INSTRUMENT_FORM_DIRECTION_LABEL}
          testId="fin-form-direction"
          options={INSTRUMENT_DIRECTION_OPTIONS}
          value={values.direction}
          disabled={isPending}
          onSelect={(direction) => patch({ direction })}
        />
      </div>

      {/* FCE:120-124 — seçili bileşim CANLI rozet; iki segmentten TÜRER. */}
      <p className="fin-form__composition">
        <span className="fin-form__composition-label">{INSTRUMENT_FORM_COMPOSITION_LABEL}</span>
        <span className="fin-form__composition-badge" data-testid="fin-form-composition">
          {instrumentCompositionLabel(values.kind, values.direction)}
        </span>
        <span className="fin-form__composition-note">{INSTRUMENT_FORM_COMPOSITION_NOTE}</span>
      </p>

      {/* FCE:127-137 — zorunlu alanlar. */}
      <div className="fin-form__grid">
        <Field
          // 🔴 FCE:129 — etiket SABİT ve TÜRDEN BAĞIMSIZ ("Çek / Senet No",
          // iki türü de kapsar). Türe göre değiştirmek mockup'ta OLMAYAN bir
          // davranış icat etmek olurdu; gerekçesi labels dosyasında.
          label={INSTRUMENT_FORM_SERIAL_LABEL}
          required
          hint={INSTRUMENT_FORM_SERIAL_HINT}
          error={lengthError(values.serialNo.trim(), SERIAL_NO_MAX_LENGTH)}
        >
          {(control) => (
            <Input
              {...control}
              className="fin-form__mono"
              placeholder="0123456789"
              value={values.serialNo}
              disabled={isPending}
              onChange={(event) => patch({ serialNo: event.target.value })}
              data-testid="fin-form-serial"
            />
          )}
        </Field>

        <Field
          label={INSTRUMENT_FORM_AMOUNT_LABEL}
          required
          error={amountError(values.amountText)}
        >
          {(control) => (
            <Input
              {...control}
              numeric
              inputMode="decimal"
              placeholder="0,00"
              value={values.amountText}
              disabled={isPending}
              onChange={(event) => patch({ amountText: event.target.value })}
              data-testid="fin-form-amount"
            />
          )}
        </Field>
      </div>

      {/* FCE:139-143 */}
      <Field
        label={INSTRUMENT_FORM_DRAWER_LABEL}
        required
        hint={INSTRUMENT_FORM_DRAWER_HINT}
        error={lengthError(values.drawerName.trim(), DRAWER_NAME_MAX_LENGTH)}
      >
        {(control) => (
          <Input
            {...control}
            placeholder="Güneşkent Gayrimenkul A.Ş."
            value={values.drawerName}
            disabled={isPending}
            onChange={(event) => patch({ drawerName: event.target.value })}
            data-testid="fin-form-drawer"
          />
        )}
      </Field>

      {/* FCE:145-157 — iki tarih; vade hatası ALANIN ALTINDA (KARAR 4). */}
      <div className="fin-form__grid">
        <Field label={INSTRUMENT_FORM_ISSUE_LABEL} required>
          {(control) => (
            <DateInput
              {...control}
              value={values.issueDate}
              disabled={isPending}
              onValueChange={(iso) => patch({ issueDate: iso })}
              data-testid="fin-form-issue"
            />
          )}
        </Field>
        <Field label={INSTRUMENT_FORM_DUE_LABEL} required error={dueError}>
          {(control) => (
            <DateInput
              {...control}
              value={values.dueDate}
              disabled={isPending}
              onValueChange={(iso) => patch({ dueDate: iso })}
              data-testid="fin-form-due"
            />
          )}
        </Field>
      </div>

      {/* FCE:159-190 — gri zeminli "İsteğe Bağlı" bölümü (KARAR 3): kullanıcı
          asgari kaydı görüp geçebilsin. */}
      <section className="fin-form__optional" aria-label={INSTRUMENT_FORM_OPTIONAL_TITLE}>
        <h3 className="fin-form__optional-title">{INSTRUMENT_FORM_OPTIONAL_TITLE}</h3>
        <div className="fin-form__grid">
          {/* 🔴 SAPMA 1 — serbest metin (sözleşme: `string`, `maxLength: 100`). */}
          <Field
            label={INSTRUMENT_FORM_BANK_LABEL}
            hint={INSTRUMENT_FORM_BANK_HINT}
            error={lengthError(values.bankName.trim(), BANK_NAME_MAX_LENGTH)}
          >
            {(control) => (
              <Input
                {...control}
                placeholder="Ziraat Bankası"
                value={values.bankName}
                disabled={isPending}
                onChange={(event) => patch({ bankName: event.target.value })}
                data-testid="fin-form-bank"
              />
            )}
          </Field>

          <Field
            label={INSTRUMENT_FORM_BANK_ACCOUNT_LABEL}
            hint={INSTRUMENT_FORM_BANK_ACCOUNT_HINT}
          >
            {(control) => (
              <Select
                {...control}
                value={values.bankAccountId}
                disabled={isPending}
                onChange={(event) => patch({ bankAccountId: event.target.value })}
                data-testid="fin-form-bank-account"
              >
                <option value="">{INSTRUMENT_FORM_SELECT_PLACEHOLDER}</option>
                {(accountsQuery.data?.items ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.bank_name} · {account.display_name ?? account.iban ?? account.id}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={INSTRUMENT_FORM_PROJECT_LABEL}>
            {(control) => (
              <Select
                {...control}
                value={values.projectId}
                disabled={isPending}
                onChange={(event) => patch({ projectId: event.target.value })}
                data-testid="fin-form-project"
              >
                <option value="">{INSTRUMENT_FORM_PROJECT_PLACEHOLDER}</option>
                {(projectsQuery.data?.items ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {/* 🔴 SAPMA 2 — ≤200 sınırı mockup'ta yazılı DEĞİLDİ, ipucu eklendi. */}
          <Field
            label={INSTRUMENT_FORM_DESCRIPTION_LABEL}
            hint={INSTRUMENT_FORM_DESCRIPTION_HINT}
            error={lengthError(values.description.trim(), DESCRIPTION_MAX_LENGTH)}
          >
            {(control) => (
              <Input
                {...control}
                placeholder="Hakediş #5 tahsilatı"
                value={values.description}
                disabled={isPending}
                onChange={(event) => patch({ description: event.target.value })}
                data-testid="fin-form-description"
              />
            )}
          </Field>
        </div>
      </section>

      {/* FCE:174-182 — "durum alanı yok" notu. Formun ASIL mesajı: kullanıcı
          "durumu neden seçemiyorum" diye aramasın. */}
      <p className="fin-form__status-note" data-testid="fin-form-status-note">
        <CheckCircleIcon className="fin-form__status-icon" />
        <span>
          <strong>{INSTRUMENT_FORM_STATUS_NOTE_TITLE}</strong> {INSTRUMENT_FORM_STATUS_NOTE_BODY}
        </span>
      </p>

      {formError !== null && (
        <p className="fin-form__error" data-testid="fin-form-error">
          {formError}
        </p>
      )}
    </Modal>
  );
}

/**
 * FCE:105-110 · segment denetimi — kapalı kümenin İKİ üyesi bitişik.
 *
 * Ham `<label>` yerine `role="group"` + `aria-labelledby` kullanılır: bir
 * `<label>` `for` ile bir DÜĞME GRUBUNA bağlanamaz. Etiket sınıfları `Field`in
 * kanonundan (`field__label*`) gelir — ikinci bir 12/600 etiket kuralı
 * yazılmaz.
 */
function SegmentField<TValue extends string>({
  label,
  testId,
  options,
  value,
  disabled,
  onSelect,
}: {
  label: string;
  testId: string;
  options: readonly { value: TValue; label: string }[];
  value: TValue;
  disabled: boolean;
  onSelect: (next: TValue) => void;
}) {
  const labelId = `${testId}-label`;
  return (
    <div className="field">
      <span className="field__label-row">
        <span className="field__label" id={labelId}>
          {label}
        </span>
        <span className="field__req" aria-hidden="true">
          *
        </span>
      </span>
      <div className="fin-seg" role="group" aria-labelledby={labelId} data-testid={testId}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="fin-seg__item"
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            data-testid={`${testId}-${option.value}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
