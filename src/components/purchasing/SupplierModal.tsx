"use client";

import { useState } from "react";

import { Modal } from "@/components/settings/Modal";
import { Button, Field, Input, Select } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useCreateSupplier } from "@/lib/api/hooks/useSupplierMutations";
import type { PaymentTerms } from "@/lib/api/hooks/useSuppliers";
import "@/components/settings/settings.css";

import { PAYMENT_TERMS_LABELS, PAYMENT_TERMS_OPTIONS } from "./purchasing-labels";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

/**
 * TED 36 "+ Tedarikçi Ekle" — spec §3 **K5 (ONAYLI SAPMA, F-BC emsali)**:
 * tedarikçi ekleme FORMUNUN mockup'ı çizilmemiştir. Bir form İCAT EDİLMEZ;
 * diyalog KARTIN KENDİ ALANLARINDAN birebir türer (TED 44 kategori · 48 VKN ·
 * 49 iletişim · 50 ödeme vadesi) + `POST /suppliers` şemasının zorunlu
 * alanları. Kartta olmayan hiçbir alan sorulmaz.
 *
 * ⚠️ `payment_terms` KAPALI kümedir (şema) → `Select`; `category` SERBEST
 * metindir (şema açıklaması: enum icat edilseydi her yeni tedarikçi türü
 * migration gerektirirdi) → `Input`.
 *
 * ⚠️ `is_active` şemada varsayılanlıdır ama üretilmiş tipte ZORUNLU görünür
 * (F-ST'de ısıran "üretilmiş tip tuzağı") → gövdede AÇIKÇA verilir.
 *
 * ⚠️ `tax_no` için biçim kuralı UYDURULMAZ (şema açıklaması: mockup'ta alan
 * zorunlu bile değil, yabancı/şahıs firması kalıba oturmayabilir).
 *
 * 🔴 Sınırlar SÖZLEŞMEDEN gelir, mockup'tan değil — `form-limits.contract.test.ts`
 * ikisini karşılaştırır. `tax_no` 11'dir (10 DEĞİL): şahıs tedarikçi 11 haneli
 * TCKN kullanır (KK-8) ve backend alanı buna göre genişletildi. 10'a çekmek
 * şahıs tedarikçiyi yeniden kırardı.
 */
export interface SupplierModalProps {
  onClose: () => void;
}

const MAX_LENGTH = { name: 200, category: 100, taxNo: 11, phone: 30 } as const;

const MESSAGES = {
  nameRequired: "Tedarikçi adı zorunludur.",
  failed: "Tedarikçi kaydedilemedi.",
} as const;

/** Mockup dört karttan üçünde vade taşır; varsayılan en yaygın olanıdır (50). */
const DEFAULT_PAYMENT_TERMS: PaymentTerms = "days_30";

export function SupplierModal({ onClose }: SupplierModalProps) {
  const createSupplier = useCreateSupplier();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [taxNo, setTaxNo] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(DEFAULT_PAYMENT_TERMS);
  const [formError, setFormError] = useState<string | null>(null);

  const isPending = createSupplier.isPending;
  // SEKME-F1.3b · `paymentTerms` VARSAYILAN değer taşır (aynı uyarı
  // `QuoteCreateModal` ile) — dirty spesifik varsayılanla eşitliktir.
  const isDirty =
    name !== "" ||
    category !== "" ||
    taxNo !== "" ||
    phone !== "" ||
    paymentTerms !== DEFAULT_PAYMENT_TERMS;
  // KURAL 7 · settings/Modal'a isDirty VERİLMEZ. Doğrudan kayda bağlanır.
  useUnsavedChanges(isDirty, "Tedarikçi");

  function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError(MESSAGES.nameRequired);
      return;
    }
    setFormError(null);

    createSupplier.mutate(
      {
        name: trimmedName,
        payment_terms: paymentTerms,
        is_active: true,
        // Boş bırakılan isteğe bağlı alanlar gövdeye HİÇ KONMAZ: boş dize
        // "değeri temizle" anlamına gelir, "dokunma" anlamına değil.
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(taxNo.trim() ? { tax_no: taxNo.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      },
      {
        onSuccess: () => onClose(),
        onError: (error) => setFormError(backendErrorMessage(error, MESSAGES.failed)),
      },
    );
  }

  return (
    <Modal
      title="Yeni Tedarikçi"
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
        <Field label="Tedarikçi Adı" required hint="Örn. Demirsan A.Ş.">
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.name}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        {/* TED 44 — serbest metin; kapalı bir küme İCAT EDİLMEZ */}
        <Field label="Kategori" hint="Örn. Demir-Çelik, Yapı Malzemeleri">
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.category}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          )}
        </Field>
        {/* TED 48 */}
        <Field label="VKN">
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.taxNo}
              value={taxNo}
              onChange={(event) => setTaxNo(event.target.value)}
            />
          )}
        </Field>
        {/* TED 49 */}
        <Field label="İletişim">
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.phone}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </Field>
        {/* TED 50 — kapalı küme */}
        <Field label="Ödeme Vadesi" required>
          {(control) => (
            <Select
              {...control}
              value={paymentTerms}
              onChange={(event) => setPaymentTerms(event.target.value as PaymentTerms)}
            >
              {PAYMENT_TERMS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {PAYMENT_TERMS_LABELS[option]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {formError && <p className="settings-note settings-note--error">{formError}</p>}
      </div>
    </Modal>
  );
}
