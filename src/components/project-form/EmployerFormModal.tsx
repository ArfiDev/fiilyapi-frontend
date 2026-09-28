"use client";

import { useState } from "react";

import { Button, Field, Input } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { useCreateEmployer } from "@/lib/api/hooks/useEmployerMutations";
import type { EmployerListItem } from "@/lib/api/hooks/useEmployers";
import { backendErrorMessage } from "@/lib/api/error-message";
import { taxNumberError } from "./validate";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
// SectionFormModal kanonu birebir izlenir: settings-form sinifi
// settings.css'ten, etiket katmani ui/field/Field'den gelir.
import "@/components/settings/settings.css";

interface EmployerFormModalProps {
  onClose: () => void;
  /** Basarili olusturmada cagrilir — EmployerCard yeni isvereni secili yapar ve modali kapatir. */
  onCreated: (employer: EmployerListItem) => void;
}

/**
 * "+ Yeni İşveren Ekle" akışı (spec §4.6) — yalnız 3 alan: Ticari Ünvan
 * (zorunlu), VKN, Yetkili Kişi. Alt-Proje 3'ün tam firma formuna (kısa ad,
 * cari kod, vergi dairesi, adres, IBAN, risk limiti, hissedar tekrarlayıcısı,
 * firma belgeleri) burada kısayol verilmez — henüz yok.
 *
 * SectionFormModal'dan tek sapma: oradaki 409 mesajı istemci
 * tarafında sabit bir Türkçe string (backend generic bir unique-violation
 * döndürdüğü için); burada backend zaten kullanıcıya hazır Türkçe mesaj
 * veriyor (bkz. backend service._DUPLICATE_TAX_NUMBER), bu yüzden
 * backendErrorMessage doğrudan kullanılır, tekrar sabitlenmez.
 */
export function EmployerFormModal({ onClose, onCreated }: EmployerFormModalProps) {
  const createEmployer = useCreateEmployer();

  const [name, setName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const isPending = createEmployer.isPending;
  const isDirty = name !== "" || taxNumber !== "" || contactPerson !== "";
  // KURAL 7 · settings/Modal'a isDirty VERİLMEZ. Doğrudan kayda bağlanır.
  useUnsavedChanges(isDirty, "İşveren");

  function validate(): string | null {
    if (!name.trim()) return "Ticari Ünvan zorunludur.";
    // VKN biçimi (spec §4.10) — boş bırakılabilir, doluysa 10/11 hane.
    return taxNumberError(taxNumber) ?? null;
  }

  function handleSubmit() {
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    createEmployer.mutate(
      {
        name: name.trim(),
        // Bos birakilan alanlar hic gonderilmez (Site/SectionFormModal deseni).
        ...(taxNumber.trim() ? { tax_number: taxNumber.trim() } : {}),
        ...(contactPerson.trim() ? { contact_person: contactPerson.trim() } : {}),
      },
      {
        onSuccess: (employer) => onCreated(employer),
        onError: (err) => setFormError(backendErrorMessage(err)),
      },
    );
  }

  return (
    <Modal
      title="Yeni İşveren Ekle"
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
            <Input {...control} value={name} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <Field label="VKN">
          {(control) => (
            <Input
              {...control}
              numeric
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
            />
          )}
        </Field>
        <Field label="Yetkili Kişi">
          {(control) => (
            <Input
              {...control}
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />
          )}
        </Field>
        {formError && <p className="settings-note settings-note--error">{formError}</p>}
      </div>
    </Modal>
  );
}
