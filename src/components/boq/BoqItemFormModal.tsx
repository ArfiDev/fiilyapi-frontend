"use client";

import { useRef, useState } from "react";

import { Button, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { formatAmount } from "@/lib/format";
import { backendErrorMessage } from "@/lib/api/error-message";
import { BackendError } from "@/lib/api/unwrap";
import {
  useCreateBoqGroup,
  useCreateBoqItem,
  useDeleteBoqItem,
  useUpdateBoqItem,
} from "@/lib/api/hooks/useBoqMutations";
import type { BoqGroup, BoqItem, BoqItemUpdate } from "@/lib/api/hooks/useBoq";
// SectionFormModal kanonu birebir: `settings-form` izgarasi settings.css'ten,
// etiket katmani ui/field/Field'den gelir. Ham <input>/<select>/<label> yasak.
import "@/components/settings/settings.css";
import "./boq.css";

export type BoqItemFormMode =
  | { kind: "create" }
  | { kind: "edit"; item: BoqItem; groupId: string };

export interface BoqItemFormModalProps {
  siteId: string;
  /** Grup açılırını doldurur; listeden gelir, yeniden çekilmez (spec §7.1). */
  groups: BoqGroup[];
  mode: BoqItemFormMode;
  /**
   * Silme kapısı (spec §2.5, §7.5.6); `false` iken `Sil` hiç basılmaz.
   * Yazma kapısı DEĞİLDİR: silme uçları `admin` seviyesindedir, `full`
   * kullanıcı formu kaydeder ama silemez.
   */
  canDelete: boolean;
  onClose: () => void;
}

// Native <option> degerlerinde UUID ile cakismayan sentinel (EmployerCard deseni).
const NEW_GROUP_OPTION = "__new__";

const DUPLICATE_CODE_MESSAGE = "Bu poz numarası bu şantiyede zaten kullanılıyor.";
const DELETE_NOT_FOUND_MESSAGE = "Kalem bulunamadı, listeyi tazeleyin.";
const DELETE_FALLBACK_MESSAGE = "İş kalemi silinemedi.";

/** Bos/gecersiz metin → null; aksi halde sayi. Frontend hicbir tutar SAKLAMAZ. */
function toNumberOrNull(text: string): number | null {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function maxSortOrder(values: number[]): number {
  return values.reduce((acc, value) => (value > acc ? value : acc), -1);
}

/**
 * Backend'in Turkce govdesi HER durumda aynen gecer (spec §7.1.5 + BOQ-SEC-F K4).
 *
 * 🔴 K4 — DUZELTILEN CANLI KUSUR: bu fonksiyon 409'u KOSULSUZ
 * `DUPLICATE_CODE_MESSAGE`e esliyordu. Tek 409 kaynagi poz-kodu cakismasiyken
 * dogruydu; BOQ-SEC'ten sonra DEGIL — backend bugun UC ayri 409 donuyor
 * (`app/modules/boq/service.py:49-56`):
 *
 *   - "Bu poz numarasi bu santiyede zaten kullaniliyor"            (kod cakismasi)
 *   - "Poz miktari bolumlere dagitilan toplamin altina indirilemez" (PATCH kota)
 *   - "Bolumlere dagitilan miktar poz miktarini asamaz"             (PUT tahsis)
 *
 * Kullanici miktari dusurmeye calistiginda poz numarasina HIC DOKUNMAMISKEN
 * "poz numarasi zaten kullaniliyor" goruyordu. Bu, genel hataya dusmekten
 * DAHA KOTUDUR: sunucunun dogru cumlesi yutulup yerine alakasiz bir yalan
 * basiliyordu. Kanon: ekranin gorevi OLDUGU GIBI BASMAKTIR.
 *
 * `DUPLICATE_CODE_MESSAGE` YEDEK olarak kalir — govdesiz bir 409'da (proxy /
 * ag katmani `detail` tasimazsa) ekran genel bir cumleye dusmek yerine en
 * olasi nedeni soyler.
 */
function itemErrorMessage(err: unknown): string {
  if (err instanceof BackendError && err.status === 409) {
    return backendErrorMessage(err, DUPLICATE_CODE_MESSAGE);
  }
  return backendErrorMessage(err);
}

// Silme hatalari (spec §7.5.4): 404 kendi metnini alir, 403 backend'in Turkce
// govdesini aynen basar, kalan her sey tek genel metne duser.
function deleteErrorMessage(err: unknown): string {
  if (err instanceof BackendError && err.status === 404) return DELETE_NOT_FOUND_MESSAGE;
  return backendErrorMessage(err, DELETE_FALLBACK_MESSAGE);
}

/**
 * İş kalemi formu — tek bileşen, iki kip (spec §7.1). Mockup'ta karşılığı
 * yoktur; tamamı *kullanıcı kararı* olarak spec §7'de sabitlenmiştir, o
 * sınırların dışına çıkılmaz.
 *
 * Tabloya eylem sütunu EKLENMEZ; düzenleme satır tetikleyicisinden açılır.
 * `Sil` yalnız `edit` kipinde ve SİLME kapısının arkasında basılır (§7.5).
 */
export function BoqItemFormModal({
  siteId,
  groups,
  mode,
  canDelete,
  onClose,
}: BoqItemFormModalProps) {
  const createGroup = useCreateBoqGroup(siteId);
  const createItem = useCreateBoqItem(siteId);
  const updateItem = useUpdateBoqItem(siteId);
  const deleteItem = useDeleteBoqItem(siteId);

  const editItem = mode.kind === "edit" ? mode.item : null;
  // BOQ tamamen bossa modal dogrudan "+ Yeni Grup" secili acilir (spec §7.3).
  const initialGroupId =
    mode.kind === "edit" ? mode.groupId : groups.length > 0 ? "" : NEW_GROUP_OPTION;

  const [groupId, setGroupId] = useState(initialGroupId);
  const [groupName, setGroupName] = useState("");
  const [code, setCode] = useState(editItem?.code ?? "");
  const [description, setDescription] = useState(editItem?.description ?? "");
  const [unit, setUnit] = useState(editItem?.unit ?? "");
  // Decimal metni STRING olarak tasinir; Number()'a cevrilip geri yazilmaz
  // (hassasiyet kaybi — spec §7.1.1).
  const [quantity, setQuantity] = useState(editItem?.quantity ?? "");
  const [unitPrice, setUnitPrice] = useState(editItem?.unit_price ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  // Onay adimi AYNI diyalogun icindedir; ikinci modal acilmaz (spec §7.5.2).
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // SEKME-F1.3b — taban anlık görüntüsü (yalnız string alanlar, mount'ta bir kez).
  const [initialSnapshot] = useState({ groupId, groupName, code, description, unit, quantity, unitPrice });
  const isDirty =
    groupId !== initialSnapshot.groupId ||
    groupName !== initialSnapshot.groupName ||
    code !== initialSnapshot.code ||
    description !== initialSnapshot.description ||
    unit !== initialSnapshot.unit ||
    quantity !== initialSnapshot.quantity ||
    unitPrice !== initialSnapshot.unitPrice;
  // Kayıt 50/ortak emir §7 — `Modal`a `isDirty` VERİLMEZ; doğrudan bağlanır.
  useUnsavedChanges(isDirty, "İş kalemi formu");

  const groupRef = useRef<HTMLSelectElement>(null);
  const groupNameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const unitPriceRef = useRef<HTMLInputElement>(null);

  const isNewGroup = groupId === NEW_GROUP_OPTION;
  const isPending =
    createGroup.isPending || createItem.isPending || updateItem.isPending || deleteItem.isPending;
  // Silinecek kayit yalniz edit kipinde vardir. Grup silme YOKTUR
  // (spec §7.5.5): son kalem silinse bile grup basligi kalir.
  const isDeletable = canDelete && mode.kind === "edit";

  const quantityValue = toNumberOrNull(quantity);
  const unitPriceValue = toNumberOrNull(unitPrice);
  // Yalniz GORUNTU: forma girmez, hicbir istege konmaz. Tek dogru kaynak
  // backend'in hesapladigi `amount` (spec §7.1.3). Girdi eksikse `—` — 0 degil.
  const amountPreview =
    quantityValue === null || unitPriceValue === null
      ? "—"
      : formatAmount(quantityValue * unitPriceValue);

  /** İlk hatalı alanı bulur; sıra form sırasıdır (spec §7.1.4). */
  function validate(): { message: string; focus: () => void } | null {
    if (!groupId) return { message: "Grup seçin.", focus: () => groupRef.current?.focus() };
    if (isNewGroup && !groupName.trim())
      return { message: "Grup adı zorunludur.", focus: () => groupNameRef.current?.focus() };
    if (!code.trim())
      return { message: "Poz No zorunludur.", focus: () => codeRef.current?.focus() };
    if (!description.trim())
      return {
        message: "İş Kalemi Tarifi zorunludur.",
        focus: () => descriptionRef.current?.focus(),
      };
    if (!unit.trim())
      return { message: "Birim zorunludur.", focus: () => unitRef.current?.focus() };
    if (quantityValue === null || quantityValue <= 0)
      return {
        message: "Miktar sıfırdan büyük olmalıdır.",
        focus: () => quantityRef.current?.focus(),
      };
    if (unitPriceValue === null || unitPriceValue < 0)
      return {
        message: "Birim Fiyat negatif olamaz.",
        focus: () => unitPriceRef.current?.focus(),
      };
    return null;
  }

  /** Kalem, seçili grubun SONUNA eklenir (spec §7.1.1); UI'da "Sıra" alanı yok. */
  function nextItemSortOrder(targetGroupId: string): number {
    const group = groups.find((candidate) => candidate.id === targetGroupId);
    if (!group) return 0;
    return maxSortOrder(group.items.map((entry) => entry.sort_order)) + 1;
  }

  /** PATCH gövdesi yalnız DEĞİŞEN alanları taşır; `sort_order` hiç gönderilmez. */
  function changedFields(targetGroupId: string): BoqItemUpdate {
    if (mode.kind !== "edit") return {};
    const body: BoqItemUpdate = {};
    if (targetGroupId !== mode.groupId) body.group_id = targetGroupId;
    // KAYIT 471 — create kipi trim uygular (aşağıda), edit kipi UYGULAMIYORDU:
    // trim'siz karşılaştırma + gönderim, baştaki/sondaki boşluklu bir kodu
    // olduğu gibi backend'e taşırdı (backend de trim yapmaz).
    const trimmedCode = code.trim();
    const trimmedDescription = description.trim();
    const trimmedUnit = unit.trim();
    if (trimmedCode !== mode.item.code) body.code = trimmedCode;
    if (trimmedDescription !== mode.item.description) body.description = trimmedDescription;
    if (trimmedUnit !== mode.item.unit) body.unit = trimmedUnit;
    if (quantity !== mode.item.quantity) body.quantity = quantity;
    if (unitPrice !== mode.item.unit_price) body.unit_price = unitPrice;
    return body;
  }

  async function handleSubmit() {
    const problem = validate();
    if (problem) {
      setFormError(problem.message);
      problem.focus();
      return;
    }
    setFormError(null);

    let targetGroupId = groupId;
    let groupJustCreated = false;
    if (isNewGroup) {
      try {
        const created = await createGroup.mutateAsync({
          name: groupName.trim(),
          sort_order: maxSortOrder(groups.map((group) => group.sort_order)) + 1,
        });
        targetGroupId = created.id;
        groupJustCreated = true;
        // 🔴 K3 — DUZELTILEN CANLI KUSUR (emsal:
        // `contract-item-form/EmployerItemFormModal.tsx:179`, F-POZGRUP K3).
        // Yerel `targetGroupId` YETMEZ: `groupId` state'i sentinel'de kalirsa,
        // kalem istegi patlayip modal ACIK kaldiginda kullanicinin ikinci
        // "Kaydet"i bu bloga TEKRAR girer ve AYNI ADLI IKINCI GRUBU yaratir.
        // Backend'de grup adi tekilligi YOKTUR → istek basarili olur ve kusur
        // SESSIZ VERI KIRLILIGI olarak canliya yazilir.
        setGroupId(created.id);
      } catch (err) {
        setFormError(backendErrorMessage(err));
        return;
      }
    }

    try {
      if (mode.kind === "create") {
        await createItem.mutateAsync({
          group_id: targetGroupId,
          code: code.trim(),
          description: description.trim(),
          unit: unit.trim(),
          quantity,
          unit_price: unitPrice,
          sort_order: nextItemSortOrder(targetGroupId),
        });
      } else {
        const body = changedFields(targetGroupId);
        // Hicbir alan degismediyse istek ATILMAZ (spec §7.1.2).
        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }
        await updateItem.mutateAsync({ itemId: mode.item.id, body });
      }
      onClose();
    } catch (err) {
      const message = itemErrorMessage(err);
      // Iki adimli yazmada ikinci istek patlarsa grup KALIR — sessiz yutma yok.
      setFormError(groupJustCreated ? `Grup oluşturuldu, kalem eklenemedi: ${message}` : message);
    }
  }

  async function handleDelete() {
    if (mode.kind !== "edit") return;
    setFormError(null);
    try {
      await deleteItem.mutateAsync(mode.item.id);
      onClose();
    } catch (err) {
      // Modal ACIK kalir: hata onay adiminda gorunur, sessiz basarisizlik yok.
      setFormError(deleteErrorMessage(err));
    }
  }

  if (isConfirmingDelete && mode.kind === "edit") {
    return (
      <Modal
        title="İş Kalemi Düzenle"
        onClose={onClose}
        footer={
          <>
            {/* Vazgec onay adimini iptal eder, DUZENLEMEYI degil: yanlislikla
                Sil'e basan kullanici doldurdugu formu kaybetmez. */}
            <Button
              variant="secondary"
              onClick={() => setIsConfirmingDelete(false)}
              disabled={isPending}
            >
              Vazgeç
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isPending}>
              Evet, sil
            </Button>
          </>
        }
      >
        <div className="settings-form">
          {/* Metin §9.2 envanteri #26 ile birebir. */}
          <p className="boq-modal__confirm">
            {`${mode.item.code} — ${mode.item.description} kalemi silinecek. Bu işlem geri alınamaz.`}
          </p>
          {formError && <p className="settings-note settings-note--error">{formError}</p>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={mode.kind === "create" ? "Yeni İş Kalemi" : "İş Kalemi Düzenle"}
      onClose={onClose}
      footer={
        <>
          {isDeletable && (
            // Alt seridin SOLUNDA (spec §7.5.1); .modal__footer flex-end
            // hizaladigindan konum `margin-right: auto` ile alinir (boq.css).
            <Button
              variant="danger"
              className="boq-modal__delete"
              onClick={() => {
                setFormError(null);
                setIsConfirmingDelete(true);
              }}
              disabled={isPending}
            >
              Sil
            </Button>
          )}
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
        <Field label="Grup" required>
          {(control) => (
            <Select
              {...control}
              ref={groupRef}
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              {/* Bos secenek etiketsizdir: metin envanterinde (§9.2) olmayan
                  bir dize ("Seçiniz" vb.) ekrana YAZILMAZ. */}
              {groups.length > 0 && <option value="" />}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
              <option value={NEW_GROUP_OPTION}>+ Yeni Grup</option>
            </Select>
          )}
        </Field>
        {isNewGroup && (
          <Field label="Grup Adı" required>
            {(control) => (
              <Input
                {...control}
                ref={groupNameRef}
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              />
            )}
          </Field>
        )}
        <Field label="Poz No" required>
          {(control) => (
            <Input
              {...control}
              ref={codeRef}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          )}
        </Field>
        <Field label="İş Kalemi Tarifi" required>
          {(control) => (
            <Input
              {...control}
              ref={descriptionRef}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>
        <Field label="Birim" required>
          {(control) => (
            <Input
              {...control}
              ref={unitRef}
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            />
          )}
        </Field>
        <Field label="Miktar" required>
          {(control) => (
            <Input
              {...control}
              ref={quantityRef}
              type="number"
              numeric
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          )}
        </Field>
        <Field label="Birim Fiyat" required>
          {(control) => (
            <Input
              {...control}
              ref={unitPriceRef}
              type="number"
              numeric
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
            />
          )}
        </Field>
        {/* <Field>/<Input> DEGIL: salt-okunur onizleme satiri (spec §7.1.3). */}
        <p className="boq-modal__preview">
          <span className="boq-modal__preview-label">Tutar (hesaplanan)</span>
          <span className="boq-modal__preview-value" data-testid="boq-amount-preview">
            {amountPreview}
          </span>
        </p>
        {formError && <p className="settings-note settings-note--error">{formError}</p>}
      </div>
    </Modal>
  );
}
