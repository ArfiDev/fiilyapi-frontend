"use client";

import { useState } from "react";

import { Modal } from "@/components/settings/Modal";
import { Button, Checkbox, Field, Input, Select } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useCreateQuote } from "@/lib/api/hooks/useQuoteMutations";
import { useSuppliers, type PaymentTerms } from "@/lib/api/hooks/useSuppliers";
import "@/components/settings/settings.css";

import {
  PAYMENT_TERMS_LABELS,
  PAYMENT_TERMS_OPTIONS,
  PURCHASING_LIST_MAX_LIMIT,
} from "./purchasing-labels";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

/**
 * TEK · teklif GİRİŞİ — spec §3 **K5 (ONAYLI SAPMA, F-BC/`SupplierModal`
 * emsali)**: teklif giriş formunun mockup'ı çizilmemiştir. Form İCAT EDİLMEZ;
 * diyalog KARTIN KENDİ ALANLARINDAN (TEK 58 tedarikçi · 63 birim fiyat ·
 * 67 teslimat · 68 garanti · 69 ödeme · 70/90 nakliye) ve
 * `PurchaseQuoteCreate` şemasının zorunlu alanlarından BİREBİR türer. Kartta
 * olmayan hiçbir alan sorulmaz.
 *
 * ⚠️ `total_cost` GÖVDEDE YOKTUR ve istemci hesaplamaz: sunucu
 * `unit_price × talebin toplam miktarı (+ hariçse nakliye)` olarak türetir.
 *
 * ⚠️ NAKLİYE İKİ HÂLLİDİR (şema açıklaması): "Dahil" ya da "Hariç (+tutar)".
 * İkisi birden gönderilirse hangisinin geçerli olduğu belirsizdir → 422. Bu
 * yüzden "Dahil" işaretliyken `shipping_cost` gövdeye HİÇ KONMAZ.
 *
 * ⚠️ `shipping_included` şemada varsayılanlıdır ama üretilmiş tipte ZORUNLU
 * görünür (F-ST "üretilmiş tip tuzağı") → gövdede AÇIKÇA verilir.
 */
export interface QuoteCreateModalProps {
  requestId: string;
  onClose: () => void;
}

/** 🔴 Sözleşmeden okunur (`form-limits.contract.test.ts`); 500 yazılıydı → 422. */
const MAX_LENGTH = { deliveryTime: 100, warrantyNote: 200 } as const;

const MESSAGES = {
  supplierRequired: "Tedarikçi seçilmelidir.",
  unitPriceRequired: "Birim fiyat sıfırdan büyük olmalıdır.",
  deliveryRequired: "Teslim süresi zorunludur.",
  shippingCostRequired: "Nakliye hariçse tutarı girilmelidir.",
  failed: "Teklif kaydedilemedi.",
} as const;

/** Mockup üç kartın ikisinde vadeli ödeme yazar; en yaygın olanı seçilir (69). */
const DEFAULT_PAYMENT_TERMS: PaymentTerms = "days_30";

export function QuoteCreateModal({ requestId, onClose }: QuoteCreateModalProps) {
  const createQuote = useCreateQuote(requestId);
  // Tedarikçi seçicisi TED ile AYNI uçtan beslenir; tavan açıkça gönderilir.
  const suppliersQuery = useSuppliers({ limit: PURCHASING_LIST_MAX_LIMIT, isActive: true });

  const [supplierId, setSupplierId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [warrantyNote, setWarrantyNote] = useState("");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(DEFAULT_PAYMENT_TERMS);
  const [shippingIncluded, setShippingIncluded] = useState(true);
  const [shippingCost, setShippingCost] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const suppliers = suppliersQuery.data?.items ?? [];
  const isPending = createQuote.isPending;
  // SEKME-F1.3b · `paymentTerms`/`shippingIncluded` BOŞ değil, VARSAYILAN
  // değer taşır (envanter uyarısı) — dirty "boşsa temiz" değil, spesifik
  // varsayılanla eşitliktir.
  const isDirty =
    supplierId !== "" ||
    unitPrice !== "" ||
    deliveryTime !== "" ||
    warrantyNote !== "" ||
    paymentTerms !== DEFAULT_PAYMENT_TERMS ||
    shippingIncluded !== true ||
    shippingCost !== "";
  // KURAL 7 · settings/Modal'a isDirty VERİLMEZ. Doğrudan kayda bağlanır.
  useUnsavedChanges(isDirty, "Teklif");

  function handleSubmit() {
    if (!supplierId) return setFormError(MESSAGES.supplierRequired);
    const price = Number(unitPrice);
    if (!Number.isFinite(price) || price <= 0) return setFormError(MESSAGES.unitPriceRequired);
    const trimmedDelivery = deliveryTime.trim();
    if (!trimmedDelivery) return setFormError(MESSAGES.deliveryRequired);
    const cost = Number(shippingCost);
    if (!shippingIncluded && (!Number.isFinite(cost) || cost <= 0)) {
      return setFormError(MESSAGES.shippingCostRequired);
    }
    setFormError(null);

    createQuote.mutate(
      {
        supplier_id: supplierId,
        unit_price: unitPrice,
        delivery_time: trimmedDelivery,
        payment_terms: paymentTerms,
        shipping_included: shippingIncluded,
        // İki hâl BİRLİKTE gönderilmez (422); boş bırakılan isteğe bağlı alan
        // gövdeye HİÇ KONMAZ (boş dize "değeri temizle" demektir).
        ...(shippingIncluded ? {} : { shipping_cost: shippingCost }),
        ...(warrantyNote.trim() ? { warranty_note: warrantyNote.trim() } : {}),
      },
      {
        onSuccess: () => onClose(),
        onError: (error) => setFormError(backendErrorMessage(error, MESSAGES.failed)),
      },
    );
  }

  return (
    <Modal
      title="Yeni Teklif"
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
        {/* 58 */}
        <Field label="Tedarikçi" required>
          {(control) => (
            <Select
              {...control}
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            >
              <option value="">Seçiniz</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 63 — toplam SUNUCUDA hesaplanır, burada YALNIZ birim fiyat sorulur */}
        <Field label="Birim Fiyat" required hint="Toplam tutarı sunucu hesaplar.">
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0}
              step="0.01"
              numeric
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
            />
          )}
        </Field>

        {/* 67 — SERBEST METİN; gün sayısına ZORLANMAZ (şema kararı) */}
        <Field label="Teslimat" required hint="Örn. “3 iş günü”, “Yarın sabah”">
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.deliveryTime}
              value={deliveryTime}
              onChange={(event) => setDeliveryTime(event.target.value)}
            />
          )}
        </Field>

        {/* 68 */}
        <Field label="Garanti">
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.warrantyNote}
              value={warrantyNote}
              onChange={(event) => setWarrantyNote(event.target.value)}
            />
          )}
        </Field>

        {/* 69 — kapalı küme */}
        <Field label="Ödeme" required>
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

        {/* 70/90 — iki hâl */}
        <Checkbox
          label="Nakliye dahil"
          checked={shippingIncluded}
          onChange={(event) => setShippingIncluded(event.target.checked)}
        />
        {!shippingIncluded && (
          <Field label="Nakliye Tutarı" required>
            {(control) => (
              <Input
                {...control}
                type="number"
                min={0}
                step="0.01"
                numeric
                value={shippingCost}
                onChange={(event) => setShippingCost(event.target.value)}
              />
            )}
          </Field>
        )}

        {formError && <p className="settings-note settings-note--error">{formError}</p>}
      </div>
    </Modal>
  );
}
