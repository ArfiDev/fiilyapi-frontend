"use client";

import { useState } from "react";

import { Button, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { stockErrorMessage } from "@/lib/api/stock-error";
import { useCreateStockItem } from "@/lib/api/hooks/useStockMutations";
import type { StockCategory } from "@/lib/api/hooks/useStockItems";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import "@/components/settings/settings.css";

const DEFAULT_CATEGORY: StockCategory = "structural";

import { STOCK_CATEGORY_LABELS, STOCK_CATEGORY_OPTIONS } from "./stock-labels";

/**
 * "+ Malzeme Ekle" (E3 67) — spec §5 **S1 (ONAYLI SAPMA)**: mockup bu formu
 * ÇİZMEMİŞTİR. Türetilmiş MİNİMAL diyalog, `POST /stock/items` şemasıyla
 * BİREBİR: kod · ad · kategori · birim · min stok. Emsal: F-BC
 * `DocumentFolderModal` (aynı Modal + `settings-form` + `Field` katmanı).
 *
 * Şemada olup forma KONULMAYAN tek alan `is_active`tir: yeni kart her zaman
 * aktif açılır, pasifleştirme `PATCH`in işidir (o yüzey bu dilimde YOK).
 */
export interface StockItemModalProps {
  onClose: () => void;
}

/** openapi `StockItemCreate` uzunluk sınırları (backend spec §2). */
const MAX_LENGTH = {
  code: 30,
  name: 200,
  unit: 20,
} as const;

const MESSAGES = {
  codeRequired: "Malzeme kodu zorunludur.",
  nameRequired: "Malzeme adı zorunludur.",
  unitRequired: "Birim zorunludur.",
  minStockInvalid: "Min stok negatif olamaz.",
} as const;

export function StockItemModal({ onClose }: StockItemModalProps) {
  const createItem = useCreateStockItem();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StockCategory>(DEFAULT_CATEGORY);
  const [unit, setUnit] = useState("");
  const [minStock, setMinStock] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // SEKME-F1.3b · dirty (tercih 1): oluşturma formu, taban her zaman boş.
  // ASYNC TABAN DEĞİL. Kayıttan sonra `onClose()` unmount ile sıfırlar.
  const isDirty =
    code.trim() !== "" ||
    name.trim() !== "" ||
    unit.trim() !== "" ||
    minStock.trim() !== "" ||
    category !== DEFAULT_CATEGORY;
  // KURAL 7 · Modal'a isDirty VERİLMEZ, doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Malzeme kartı");

  const isPending = createItem.isPending;

  function validate(): string | null {
    if (!code.trim()) return MESSAGES.codeRequired;
    if (!name.trim()) return MESSAGES.nameRequired;
    if (!unit.trim()) return MESSAGES.unitRequired;
    const trimmedMin = minStock.trim();
    if (trimmedMin && !(Number(trimmedMin) >= 0)) return MESSAGES.minStockInvalid;
    return null;
  }

  function handleSubmit() {
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);

    const trimmedMin = minStock.trim();
    createItem.mutate(
      {
        code: code.trim(),
        name: name.trim(),
        category,
        unit: unit.trim(),
        // ⚠️ ÜRETİLMİŞ TİP TUZAĞI: şemada varsayılanı olan `is_active`
        // `openapi-typescript` çıktısında ZORUNLU görünür — açıkça verilir.
        is_active: true,
        // Boş bırakılan eşik HİÇ gönderilmez: kart eşiksiz açılır, durum
        // hücresi "—" basar (uydurma eşik YOK).
        ...(trimmedMin ? { min_stock: Number(trimmedMin) } : {}),
      },
      {
        onSuccess: () => onClose(),
        // ST §4b kanonu: 404 varlık / 422 kural — Türkçe ve GÖRÜNÜR.
        onError: (error) => setFormError(stockErrorMessage(error)),
      },
    );
  }

  return (
    <Modal
      title="Yeni Malzeme Kartı"
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
        <Field label="Malzeme Kodu" required hint="Örn. SNK-0421 — önek zorunlu değildir">
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.code}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          )}
        </Field>
        <Field label="Malzeme Adı" required>
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.name}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        {/* Kategori KAPALI kümedir (enum) — serbest metin kabul edilmez. */}
        <Field label="Kategori" required>
          {(control) => (
            <Select
              {...control}
              value={category}
              onChange={(event) => setCategory(event.target.value as StockCategory)}
            >
              {STOCK_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {STOCK_CATEGORY_LABELS[option]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {/* Birim SERBEST METİNDİR (backend spec §2: küme açık uçlu). */}
        <Field label="Birim" required hint="Örn. Ton, Torba, Metre, m³">
          {(control) => (
            <Input
              {...control}
              maxLength={MAX_LENGTH.unit}
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            />
          )}
        </Field>
        <Field label="Min Stok" hint="Boş bırakılırsa durum rozeti hesaplanmaz">
          {(control) => (
            <Input
              {...control}
              numeric
              inputMode="decimal"
              value={minStock}
              onChange={(event) => setMinStock(event.target.value)}
            />
          )}
        </Field>
        {formError && <p className="settings-note settings-note--error">{formError}</p>}
      </div>
    </Modal>
  );
}
