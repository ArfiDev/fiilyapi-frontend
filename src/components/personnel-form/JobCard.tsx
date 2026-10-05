import { useId } from "react";

import { DateInput, Field, Input, Select } from "@/components/ui";
import type { SubcontractorListItem } from "@/lib/api/hooks/useSubcontractors";

import {
  ASSIGNED_SECTION_OPTIONS,
  EMPLOYEE_TYPE_OPTIONS,
  NO_SUBCONTRACTOR_LABEL,
  PAYMENT_METHOD_OPTIONS,
  PENDING_GENERAL_SOURCE,
  PENDING_SECTION_SOURCE,
  PERSONNEL_FIELD_MAX_LENGTH,
  SELECT_PLACEHOLDER,
  TRADE_OPTIONS,
  WAGE_TYPE_OPTIONS,
} from "./constants";
import type { PersonnelFormValues } from "./form-state";
import { MaskedField } from "./masked-fields";
import type { PersonnelFormErrors } from "./validate";

export interface SubcontractorPickerState {
  items: readonly SubcontractorListItem[];
  isLoading: boolean;
  isError: boolean;
}

/** "Atandığı Proje" seçicisinin veri durumu — `SubcontractorPickerState` ikizi. */
export interface ProjectPickerState {
  items: readonly { id: string; name: string }[];
  isLoading: boolean;
  isError: boolean;
}

interface JobCardProps {
  values: PersonnelFormValues;
  onChange: <K extends keyof PersonnelFormValues>(
    field: K,
    value: PersonnelFormValues[K],
  ) => void;
  subcontractors: SubcontractorPickerState;
  projects: ProjectPickerState;
  errors?: PersonnelFormErrors;
  /** IZN-F4c.2 — maskeli alanlar: salt okunur "—" + kilit, gövdeye girmez. */
  maskedFields?: ReadonlySet<keyof PersonnelFormValues>;
}

/** "Bağlı Taşeron" seçicisinin altındaki GÖRÜNÜR not — sessiz boş liste yasak. */
export function subcontractorNote(
  state: SubcontractorPickerState,
  isEnabled: boolean,
): string {
  if (!isEnabled) {
    return "Bağlı taşeron yalnız “Taşeron İşçisi” seçildiğinde girilir — şirket kadrosunda boş kalır.";
  }
  if (state.isLoading) return "Yükleniyor…";
  if (state.isError) {
    return "Taşeron listesi yüklenemedi — personeli taşeron bağlamadan da kaydedebilirsiniz.";
  }
  if (state.items.length === 0) {
    return "Kayıtlı aktif taşeron yok — personeli taşeron bağlamadan kaydedebilirsiniz.";
  }
  return "Listede aradığınız taşeron yoksa taşeron kartı henüz açılmamış olabilir.";
}

/**
 * "Atandığı Proje" seçicisinin altındaki GÖRÜNÜR not.
 *
 * Alan mockup'ta `*` taşır ama liste boşsa/yüklenemediyse zorunluluk
 * UYGULANMAZ (`validate.ts`): doldurulamayan bir alanı zorunlu saymak formu
 * kilitlerdi. Kullanıcı bunun nedenini ekranda okur.
 */
export function projectNote(state: ProjectPickerState): string {
  if (state.isLoading) return "Yükleniyor…";
  if (state.isError) {
    return "Proje listesi yüklenemedi — personeli projeye atamadan da kaydedebilirsiniz.";
  }
  if (state.items.length === 0) {
    return "Kayıtlı proje yok — personeli taslak olarak kaydedebilirsiniz; yayımlamak için önce bir proje eklenmeli.";
  }
  return "Personelin çalışacağı proje; sonradan personel kartından değiştirilebilir.";
}

/**
 * 💼 İş Bilgileri (mockup satır 86–119).
 *
 * F-İK T4'te ücret bloğu dâhil KART neredeyse tümüyle ETKİNDİR: Çalışan Tipi
 * (91) · Bağlı Taşeron (95) · Meslek / Görev (99) · İşe Giriş Tarihi (101) ·
 * Atandığı Proje (103-104) · Ücret Tipi (113) · Ücret Tutarı (114) · Ödeme
 * Şekli (115) · IBAN (116) · SGK Sicil No (117).
 *
 * PENDING (tek kalan): **Bölüm** (107-108) — sunucuda proje düzeyinde bölüm
 * listeleyen bir yol yok (bölümler şantiyeye bağlı). Alan SİLİNMEZ,
 * devre-dışı basılır ve gerekçesi ipucu satırında GÖRÜNÜR yazar.
 */
export function JobCard({
  values,
  onChange,
  subcontractors,
  projects,
  errors,
  maskedFields,
}: JobCardProps) {
  const isMasked = (field: keyof PersonnelFormValues) => maskedFields?.has(field) === true;
  const noteId = useId();
  const projectNoteId = useId();
  const isSubcontractorEnabled = values.source === "subcontractor";

  return (
    <section className="pf-card">
      {/* 87 */}
      <h2 className="pf-card__title">💼 İş Bilgileri</h2>

      {/* 88 — üç sütun */}
      <div className="pf-grid pf-grid--3">
        {/* 90-91 */}
        <Field label="Çalışan Tipi" required error={errors?.source}>
          {(control) => (
            <Select
              {...control}
              value={values.source}
              status={errors?.source ? "error" : "default"}
              onChange={(event) => {
                const nextSource = event.target.value as PersonnelFormValues["source"];
                onChange("source", nextSource);
                // Taşerondan çıkıldığında seçim TEMİZLENİR: aksi hâlde
                // "Taşeron İşçisi → firma seç → Şirket Kadrosu" akışında
                // gövdeye ölü bir taşeron kimliği taşınırdı.
                if (nextSource !== "subcontractor") onChange("subcontractorId", "");
              }}
            >
              <option value="">{SELECT_PLACEHOLDER}</option>
              {EMPLOYEE_TYPE_OPTIONS.map((option) => (
                <option key={option.label} value={option.source}>
                  {option.label}
                </option>
              ))}
              {/* Düzenleme kipinde SEED edilmiş eski "genel işçi" kaydı —
                  mockup'ta karşılığı yok, formdan yeniden SEÇİLEMEZ ama
                  dokunulmadan bırakılabilir (K2, "general" backend'de GERÇEK). */}
              {values.source === "general" && (
                <option value="general" disabled title={PENDING_GENERAL_SOURCE}>
                  Genel İşçi (mevcut kayıt)
                </option>
              )}
            </Select>
          )}
        </Field>

        {/* 94-95 — mockup'ın SABİT taşeron adları yerine GERÇEK veri */}
        <Field label="Bağlı Taşeron">
          {(control) => (
            <Select
              {...control}
              aria-describedby={
                [control["aria-describedby"], noteId].filter(Boolean).join(" ") || undefined
              }
              disabled={!isSubcontractorEnabled}
              value={values.subcontractorId}
              onChange={(event) => onChange("subcontractorId", event.target.value)}
            >
              <option value="">{NO_SUBCONTRACTOR_LABEL}</option>
              {subcontractors.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 98-99 */}
        <Field label="Meslek / Görev" required error={errors?.trade}>
          {(control) => (
            <Select
              {...control}
              value={values.trade}
              status={errors?.trade ? "error" : "default"}
              onChange={(event) => onChange("trade", event.target.value)}
            >
              <option value="">{SELECT_PLACEHOLDER}</option>
              {/* Düzenleme kipinde sunucudaki meslek sekiz seçenek DIŞINDA
                  olabilir — sessizce KIRPILMASIN diye kendi değeri eklenir. */}
              {values.trade && !TRADE_OPTIONS.includes(values.trade) && (
                <option value={values.trade}>{values.trade}</option>
              )}
              {TRADE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 101 */}
        <Field label="İşe Giriş Tarihi" required error={errors?.hireDate}>
          {(control) => (
            <DateInput
              {...control}
              value={values.hireDate}
              status={errors?.hireDate ? "error" : "default"}
              onValueChange={(iso) => onChange("hireDate", iso)}
            />
          )}
        </Field>

        {/* 103-104 — mockup'ın SABİT proje adları yerine GERÇEK veri */}
        <Field label="Atandığı Proje" required error={errors?.assignedProjectId}>
          {(control) => (
            <Select
              {...control}
              aria-describedby={
                [control["aria-describedby"], projectNoteId].filter(Boolean).join(" ") ||
                undefined
              }
              value={values.assignedProjectId}
              status={errors?.assignedProjectId ? "error" : "default"}
              onChange={(event) => onChange("assignedProjectId", event.target.value)}
            >
              <option value="">{SELECT_PLACEHOLDER}</option>
              {/* Düzenleme kipinde kaydın projesi listede olmayabilir (arşiv,
                  yetki süzgeci) — seçim sessizce KIRPILMASIN diye korunur. */}
              {values.assignedProjectId &&
                !projects.items.some((item) => item.id === values.assignedProjectId) && (
                  <option value={values.assignedProjectId}>Atanmış proje (listede yok)</option>
                )}
              {projects.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 107-108 — PENDING: proje düzeyinde bölüm listeleme ucu YOK.
            Alan SİLİNMEZ; gerekçe ipucu satırında GÖRÜNÜR (title'da saklı değil). */}
        <Field label="Bölüm" hint={PENDING_SECTION_SOURCE}>
          {(control) => (
            <Select {...control} disabled value="" title={PENDING_SECTION_SOURCE}>
              <option value="">{SELECT_PLACEHOLDER}</option>
              {ASSIGNED_SECTION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {/* Sessiz boş açılır liste YASAK: seçiciler hangi durumda olursa olsun
          görünür açıklama basılır ve `aria-describedby` ile bağlanır. */}
      <p className="pnf-picker-note" id={noteId}>
        {subcontractorNote(subcontractors, isSubcontractorEnabled)}
      </p>
      <p className="pnf-picker-note" id={projectNoteId}>
        {projectNote(projects)}
      </p>

      {/* 111 — ince ayraç */}
      <div className="pnf-divider" />

      {/* 112 — ücret bloğu */}
      <div className="pf-grid pf-grid--3">
        {/* 113 — mockup'ta "Seçiniz..." YOKTUR, ilk seçenek "Günlük" */}
        <Field label="Ücret Tipi" required error={errors?.wageType}>
          {(control) => (
            <Select
              {...control}
              value={values.wageType}
              status={errors?.wageType ? "error" : "default"}
              onChange={(event) =>
                onChange("wageType", event.target.value as PersonnelFormValues["wageType"])
              }
            >
              {WAGE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 114 */}
        {isMasked("wageAmount") ? (
          <MaskedField label="Ücret Tutarı (₺)" />
        ) : (
          <Field label="Ücret Tutarı (₺)" required error={errors?.wageAmount}>
            {(control) => (
              <Input
                {...control}
                type="number"
                numeric
                min={0}
                step="0.01"
                value={values.wageAmount}
                placeholder="1200"
                className="pnf-amount"
                status={errors?.wageAmount ? "error" : "default"}
                onChange={(event) => onChange("wageAmount", event.target.value)}
              />
            )}
          </Field>
        )}

        {/* 115 */}
        <Field label="Ödeme Şekli">
          {(control) => (
            <Select
              {...control}
              value={values.paymentMethod}
              onChange={(event) =>
                onChange(
                  "paymentMethod",
                  event.target.value as PersonnelFormValues["paymentMethod"],
                )
              }
            >
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 116 — iki sütun genişliğinde */}
        {isMasked("iban") ? (
          <MaskedField label="IBAN" className="pf-col-span-2" />
        ) : (
          <Field label="IBAN" className="pf-col-span-2">
            {(control) => (
              <Input
                {...control}
                numeric
                maxLength={PERSONNEL_FIELD_MAX_LENGTH.iban}
                value={values.iban}
                placeholder="TR12 0001 0093 0012 3456 7890"
                onChange={(event) => onChange("iban", event.target.value)}
              />
            )}
          </Field>
        )}

        {/* 117 — ipucu metni mockup'tan AYNEN */}
        {isMasked("sgkNo") ? (
          <MaskedField label="SGK Sicil No" />
        ) : (
          <Field label="SGK Sicil No" hint="Boş bırakılırsa otomatik sorgulanır">
            {(control) => (
              <Input
                {...control}
                numeric
                maxLength={PERSONNEL_FIELD_MAX_LENGTH.sgk_no}
                value={values.sgkNo}
                placeholder="123 456 789 00"
                onChange={(event) => onChange("sgkNo", event.target.value)}
              />
            )}
          </Field>
        )}
      </div>
    </section>
  );
}
