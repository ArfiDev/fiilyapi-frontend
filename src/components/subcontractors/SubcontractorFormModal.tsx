"use client";

import { useState } from "react";

import { Button, Field, Input } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { taxNumberError } from "@/components/project-form/validate";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useCreateSubcontractor } from "@/lib/api/hooks/useSubcontractorMutations";
import type { SubcontractorResponse } from "@/lib/api/hooks/useSubcontractorMutations";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import "@/components/settings/settings.css";

/**
 * PAYLAŞILAN "+ Taşeron Ekle" modalı.
 *
 * İKİ çağıranı vardır ve ikisi de AYNI bileşeni kullanır:
 * - TL (`Taşeron Listesi.dc.html` 19) — bu dilimin ekranı;
 * - FSO (`Form - Sözleşme Oluştur.dc.html`, "+ Yeni Taşeron Ekle") — T6.
 * Bu yüzden `src/components/subcontractors/` altında BAĞIMSIZ durur, hiçbir
 * ekranın state'ine bağlı değildir ve başarıda oluşan kaydı `onCreated` ile
 * ÇAĞIRANA geri verir (T6 onu doğrudan seçili taşeron yapar).
 *
 * Emsal `EmployerFormModal` (proje formu) — Modal + `settings-form` + `Field`
 * katmanı birebir aynıdır. Fark: alan kümesi `SubcontractorCreate` şemasından
 * gelir (openapi: `name` ZORUNLU; `tax_number` ≤11, `contact_person` ≤200,
 * `phone` ≤30, `email` ≤255, `category` ≤100 — hepsi nullable).
 *
 * `is_active` alanı forma KONULMAZ: şemada varsayılanı `true`dur ve mockup'ta
 * karşılığı yoktur (yeni eklenen firma zaten aktiftir); pasifleştirme
 * `PATCH`in işidir.
 */
export interface SubcontractorFormModalProps {
  onClose: () => void;
  /** Başarılı oluşturmada oluşan kayıtla çağrılır (T6 seçili yapar). */
  onCreated: (subcontractor: SubcontractorResponse) => void;
  /** İsteğe bağlı ön-doldurma — T6'da seçicideki yazılmış ad buraya taşınır. */
  initialName?: string;
}

/** openapi `SubcontractorCreate` uzunluk sınırları — metin girişlerinde `maxLength`. */
const MAX_LENGTH = {
  name: 200,
  taxNumber: 11,
  contactPerson: 200,
  phone: 30,
  email: 255,
  category: 100,
} as const;

const MESSAGES = {
  nameRequired: "Taşeron ünvanı zorunludur.",
  emailInvalid: "Geçerli bir e-posta adresi giriniz.",
} as const;

/** Boş geçerli; dolu ise en basit biçim denetimi (sunucununkini taklit eder). */
function emailError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? undefined : MESSAGES.emailInvalid;
}

export function SubcontractorFormModal({
  onClose,
  onCreated,
  initialName = "",
}: SubcontractorFormModalProps) {
  const createSubcontractor = useCreateSubcontractor();

  const [name, setName] = useState(initialName);
  const [taxNumber, setTaxNumber] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // SEKME-F1.3b · dirty (tercih 1): oluşturma formu, taban boş — `name` yalnız
  // `initialName` ile ÖN DOLU olabilir (T6 seçiciden taşınan yazılmış ad), bu
  // yüzden `name` tabanı `initialName`e göre karşılaştırılır. ASYNC TABAN
  // DEĞİL. `onCreated`/`onClose` çağıranın kapatmasıyla unmount olur.
  const isDirty =
    name !== initialName ||
    taxNumber.trim() !== "" ||
    contactPerson.trim() !== "" ||
    phone.trim() !== "" ||
    email.trim() !== "" ||
    category.trim() !== "";
  // KURAL 7 · Modal'a isDirty VERİLMEZ, doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Taşeron");

  const isPending = createSubcontractor.isPending;

  function validate(): string | null {
    if (!name.trim()) return MESSAGES.nameRequired;
    return taxNumberError(taxNumber) ?? emailError(email) ?? null;
  }

  function handleSubmit() {
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    createSubcontractor.mutate(
      {
        name: name.trim(),
        // `is_active` şemada varsayılanlıdır ama `gen:api` çıktısında ZORUNLU
        // alan olarak görünür; yeni firma her zaman aktif açılır.
        is_active: true,
        // Boş bırakılan alanlar HİÇ gönderilmez (EmployerFormModal deseni).
        ...(taxNumber.trim() ? { tax_number: taxNumber.trim() } : {}),
        ...(contactPerson.trim() ? { contact_person: contactPerson.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(category.trim() ? { category: category.trim() } : {}),
      },
      {
        onSuccess: (subcontractor) => onCreated(subcontractor),
        onError: (err) => setFormError(backendErrorMessage(err)),
      },
    );
  }

  return (
    <Modal
      title="Yeni Taşeron Ekle"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="settings-form">
        <Field label="Ticari Ünvan" required>
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="VKN">
          {(control) => (
            <Input
              {...control}
              numeric
              maxLength={MAX_LENGTH.taxNumber}
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
            />
          )}
        </Field>
        {/* 57 · kategori rozetinin kaynağı; serbest metindir (enum YOK). */}
        <Field label="Kategori" hint="Örn. Betonarme, Elektrik, Mekanik">
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.category}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          )}
        </Field>
        <Field label="Yetkili Kişi">
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.contactPerson}
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />
          )}
        </Field>
        {/* 56 · satır alt metnindeki "İletişim: 0212 555 00 01" bu alandan gelir. */}
        <Field label="Telefon">
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.phone}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          )}
        </Field>
        <Field label="E-posta">
          {(control) => (
            <Input
              {...control}
              type="email"
              maxLength={MAX_LENGTH.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        {formError && <p className="settings-note settings-note--error">{formError}</p>}
      </div>
    </Modal>
  );
}
