"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { CheckCircleIcon } from "@/components/ui/icons";
import { Modal } from "@/components/settings/Modal";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { backendErrorMessage } from "@/lib/api/error-message";
import { formatAmount } from "@/lib/format";
import {
  useCreateEmployerContractGroup,
  useCreateEmployerContractItem,
} from "@/lib/api/hooks/useContractMutations";
import type {
  EmployerContractDetail,
  EmployerContractItemsResponse,
} from "@/lib/api/hooks/useContract";

import { employerContractDistributionHref } from "@/components/contracts/employer-contract-tabs";
// Kapanmış-poz eşiği TEK kaynaktır (POZ 100); bu panel de o karardan türer.
import { isRemainingSettled } from "@/components/contracts/distribution-derive";
import { cx } from "@/lib/cx";

import { buildEmployerItemBody, nextSortOrder } from "./build-body";
import { lineTotalPreview } from "./line-total";
import {
  EMPLOYER_ITEM_TEXT as TEXT,
  ESCALATION_OPTIONS,
  ESCALATION_READONLY_REASON,
  GROUP_PLACEHOLDER_OPTION,
  INDEX_TYPE_EMPTY_OPTION,
  INDEX_TYPE_LABELS,
  INDEX_TYPE_ORDER,
  MAX_LENGTH,
  NEW_GROUP_OPTION,
  SUMMARY_DASH,
  UNIT_OPTIONS,
  UNIT_PLACEHOLDER_OPTION,
} from "./constants";
import { SummaryRow } from "./SummaryRow";
import {
  parseEmployerQuantity,
  parseEmployerUnitPrice,
  validateEmployerItem,
  type EmployerItemFormValues,
} from "./validate";
import "./contract-item-form.css";

/**
 * İŞV · `Form - Poz Ekle Isveren.dc.html` (F-BLG T2a).
 * Uç: `POST /projects/{project_id}/contract/items`.
 *
 * TAŞ formundan İKİ iş kuralı farkı (mockup'ın kendi notu, 32-35):
 * `group_id` ZORUNLU (104) ve `unit_price` ZORUNLU (163) — fiyatsız poz
 * girilemez (94).
 *
 * 🔴 "Fiyat Farkı Ayarı" kartı (178-200) SÖZLEŞMENİN ayarını gösterir: iki
 * seçici de `disabled`dır, değerleri `has_price_escalation`/`index_type`ten
 * OKUNUR ve poz gövdesine GİRMEZ (`EmployerContractItemCreate` böyle bir alan
 * tanımlamaz — poz sözleşmenin ayarını devralır). Kart mockup'ta çizili
 * olduğu için SİLİNMEZ; gerekçe `title`da saklanmaz, görünür basılır.
 *
 * 🔴 ONAYLI SAPMA (F-POZGRUP) — Grup açılırındaki "+ Yeni Grup" seçeneği ve
 * onu izleyen "Grup Adı" alanı mockup'ta ÇİZİLİ DEĞİLDİR. Gerekçe: mockup'ın
 * çizdiği hâl ilk pozu eklemeyi imkânsız kılıyor — yeni sözleşmede hiç grup
 * yoktur, `group_id` ise zorunludur, grup yaratmanın başka girişi de yoktur.
 * Mockup'ın alan sırası/etiketleri/hint'leri DEĞİŞMEDİ; yeni alan grup
 * açılırının hemen ardına, `BoqItemFormModal` (Ekran 13) deseniyle eklendi.
 */
export interface EmployerItemFormModalProps {
  projectId: string;
  /** 104 · grup açılırının kaynağı — ayrı GET ucu YOK, kalem listesinden gelir. */
  groups: EmployerContractItemsResponse["groups"];
  /** 178-200 fiyat farkı ayarı + 226 sözleşme tutarı. */
  detail: EmployerContractDetail;
  onClose: () => void;
}

const EMPTY_VALUES: EmployerItemFormValues = {
  groupId: "",
  groupName: "",
  code: "",
  description: "",
  unit: "",
  quantity: "",
  unitPrice: "",
  sortOrder: "",
};

export function EmployerItemFormModal({
  projectId,
  groups,
  detail,
  onClose,
}: EmployerItemFormModalProps) {
  const router = useRouter();
  const createGroup = useCreateEmployerContractGroup(projectId);
  const createItem = useCreateEmployerContractItem(projectId);

  const [values, setValues] = useState<EmployerItemFormValues>(() =>
    // BOQ 93-94 birebir: hiç grup yoksa form doğrudan "+ Yeni Grup" seçili
    // açılır — kullanıcı boş bir açılırla baş başa bırakılmaz.
    groups.length > 0 ? EMPTY_VALUES : { ...EMPTY_VALUES, groupId: NEW_GROUP_OPTION },
  );
  // SEKME-F1.3b — taban anlık görüntüsü (yalnız string alanlar).
  const [initialValues] = useState(values);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  // Kayıt 50/ortak emir §7 — `Modal`a `isDirty` VERİLMEZ; doğrudan bağlanır.
  useUnsavedChanges(isDirty, "İşveren poz formu");
  /**
   * Yaratılmış ama listeye (kalem sorgusu) HENÜZ yansımamış grup. Açılıra
   * geçici seçenek olarak eklenir: tazeleme gelene kadar `values.groupId`
   * hiçbir `<option>`la eşleşmezse tarayıcı seçimi boş gösterirdi.
   */
  const [createdGroup, setCreatedGroup] = useState<{ id: string; name: string } | null>(null);
  const [goToDistribution, setGoToDistribution] = useState(true); // 241 · işaretli
  const [formError, setFormError] = useState<string | null>(null);

  const groupRef = useRef<HTMLSelectElement>(null);
  const groupNameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const unitRef = useRef<HTMLSelectElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const unitPriceRef = useRef<HTMLInputElement>(null);
  const sortOrderRef = useRef<HTMLInputElement>(null);

  const isNewGroup = values.groupId === NEW_GROUP_OPTION;
  const isPending = createGroup.isPending || createItem.isPending;
  // Yaratılmış grup listeye düştüyse geçici seçenek tekrarlanmaz.
  const pendingGroupOption =
    createdGroup && !groups.some((group) => group.id === createdGroup.id) ? createdGroup : null;

  // no 46 · `groups` PROP'u kalem sorgusu tazelenene kadar YARATILMIŞ grubu
  // içermez (`pendingGroupOption` bu geçici pencerenin karşılığıdır). Yalnız
  // prop'ta aramak, ikinci adım (kalem yaratma) patladığında özet satırının
  // grup adını KAYBETMESİNE yol açıyordu — id gerçek ama görünüşte "yok".
  const selectedGroup =
    groups.find((group) => group.id === values.groupId) ??
    (pendingGroupOption && pendingGroupOption.id === values.groupId
      ? { ...pendingGroupOption, items: [], sort_order: 0 }
      : null);
  // 126 · mockup'ın "11"i GÖSTERMELİKtir: sıra GRUP İÇİNDE hesaplanır (127).
  const defaultSortOrder = nextSortOrder(
    (selectedGroup?.items ?? []).map((item) => item.sort_order),
  );
  // 🔴 K6: önizleme T30 ile OKUNMUŞ değerlerden hesaplanır; okunamayan girdi → önizleme yok.
  const parsedQuantity = parseEmployerQuantity(values.quantity);
  const parsedUnitPrice = parseEmployerUnitPrice(values.unitPrice);
  const preview =
    parsedQuantity.kind === "ok" && parsedUnitPrice.kind === "ok"
      ? lineTotalPreview(parsedQuantity.value, parsedUnitPrice.value)
      : null;

  const allItems = groups.flatMap((group) => group.items);
  // 🔴 KAPSAM MASKESİ (kullanıcı kararı 2026-09-19) — sayaç UYDURULMAZ.
  //
  // Eski hâl `Number(item.remaining_quantity) === 0` sayıyordu. `finance`
  // kapsamlı rolde `remaining_quantity` `null` gelir ve `Number(null)` **0**
  // olduğu için TÜM pozlar "dağıtılmış" sayılıyor, "dağıtılmamış" sayacı da
  // `uzunluk − hepsi` = **0** basıyordu. İki sayı da sahteydi ve ikisi de canlı
  // renkle (`--ok` / `--warn`) gerçek veri gibi gösteriliyordu.
  //
  // 🔴 Neden `isRemainingSettled` ile SAYMAK da yanlış olurdu: o, maskeli pozu
  // "kapanmamış" sayar ve bu sefer "dağıtılmamış" sayacı YUKARI doğru yalan
  // söylerdi. Kalan metraj görünmeden bu iki sayı BİLİNEMEZ — doğru cevap bir
  // sayı değil "—"dir (maske kanonu: eksik toplamı gerçek gibi basma).
  //
  // Tek bir poz bile maskeliyse TOPLAM bilinemez: kısmî sayım, bütünü temsil
  // ediyormuş gibi okunurdu.
  const hasMaskedRemaining = allItems.some((item) => item.remaining_quantity === null);
  const distributedCount = hasMaskedRemaining
    ? null
    : allItems.filter((item) => isRemainingSettled(item.remaining_quantity)).length;

  function set<K extends keyof EmployerItemFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function focusField(field: string) {
    const map: Record<string, { focus: () => void } | null | undefined> = {
      group: groupRef.current,
      groupName: groupNameRef.current,
      code: codeRef.current,
      description: descriptionRef.current,
      unit: unitRef.current,
      quantity: quantityRef.current,
      unitPrice: unitPriceRef.current,
      sortOrder: sortOrderRef.current,
    };
    map[field]?.focus();
  }

  async function handleSubmit() {
    const problem = validateEmployerItem(values);
    if (problem) {
      setFormError(problem.message);
      focusField(problem.field);
      return;
    }
    setFormError(null);

    // ── 1. adım · gerekiyorsa GRUP (BOQ 189-203 deseni) ──────────────────
    let targetGroupId = values.groupId;
    let groupJustCreated = false;
    if (isNewGroup) {
      try {
        const created = await createGroup.mutateAsync({
          name: values.groupName.trim(),
          sort_order: nextSortOrder(groups.map((group) => group.sort_order)),
        });
        targetGroupId = created.id;
        groupJustCreated = true;
        setCreatedGroup({ id: created.id, name: created.name });
        // 🔴 ŞEF KARARI (F-POZGRUP K3): grup YARATILDIKTAN sonra seçim
        // sentinel'de BIRAKILMAZ, gerçek id'ye çekilir. Sentinel'de kalsaydı
        // kalem isteği patladığında kullanıcının "tekrar dene"si İKİNCİ bir
        // aynı adlı grup yaratırdı. Bu aynı zamanda "grup açılırda seçili
        // kalır" şartını da karşılar.
        setValues((prev) => ({ ...prev, groupId: created.id }));
      } catch (err) {
        setFormError(backendErrorMessage(err));
        return;
      }
    }

    // ── 2. adım · KALEM ──────────────────────────────────────────────────
    try {
      await createItem.mutateAsync(
        buildEmployerItemBody({ ...values, groupId: targetGroupId }, defaultSortOrder),
      );
    } catch (err) {
      // İki adımlı yazmada ikinci istek patlarsa grup SİLİNMEZ ve form
      // kapanmaz — kullanıcının yazdığı hiçbir alan kaybolmaz (BOQ 226-230).
      const message = backendErrorMessage(err);
      setFormError(
        groupJustCreated ? `Grup oluşturuldu, kalem eklenemedi: ${message}` : message,
      );
      return;
    }

    // 242 · işaretliyse dağıtım ekranına geçilir (kota atanmadan hakediş
    // yapılamaz — 232-233); değilse yalnız diyalog kapanır.
    onClose();
    if (goToDistribution) router.push(employerContractDistributionHref(projectId));
  }

  return (
    <Modal
      title={TEXT.title}
      className="pif-modal"
      onClose={onClose}
      footer={
        <>
          {/* 240-243 · onay kutusu şeridin SOLUNDA */}
          <span className="pif__keep-open">
            <Checkbox
              size="lg"
              label={TEXT.goToDistribution}
              checked={goToDistribution}
              disabled={isPending}
              onChange={(event) => setGoToDistribution(event.target.checked)}
              data-testid="eci-go-distribution"
            />
          </span>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {TEXT.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            {TEXT.submit}
          </Button>
        </>
      }
    >
      <p className="pif__title">{TEXT.subtitle}</p>

      {/* 88-95 · iş kuralı bandı */}
      <p className="pif-rule">
        <span className="pif-rule__icon" aria-hidden="true">
          <CheckCircleIcon />
        </span>
        <span>{TEXT.rule}</span>
      </p>

      <div className="pif">
        {/* ── SOL: form (100-201) ────────────────────────────────────────── */}
        <div>
          <section className="pif-card">
            <h3 className="pif-card__title">{TEXT.definitionCard}</h3>
            <div className="pif-grid pif-grid--flush">
              <Field label={TEXT.group} required hint={TEXT.groupHint}>
                {(control) => (
                  <Select
                    {...control}
                    ref={groupRef}
                    value={values.groupId}
                    onChange={(event) => set("groupId", event.target.value)}
                  >
                    <option value="">{GROUP_PLACEHOLDER_OPTION}</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                    {pendingGroupOption && (
                      <option value={pendingGroupOption.id}>{pendingGroupOption.name}</option>
                    )}
                    {/* ONAYLI SAPMA — bkz. dosya başı notu. */}
                    <option value={NEW_GROUP_OPTION}>{TEXT.newGroupOption}</option>
                  </Select>
                )}
              </Field>
              {/* Alan sırası korunur: yeni alan grup açılırının HEMEN ardında,
                  "Poz No"dan ÖNCE (BOQ 329-340 deseni). */}
              {isNewGroup && (
                <Field label={TEXT.groupName} required hint={TEXT.groupNameHint}>
                  {(control) => (
                    <Input
                      {...control}
                      ref={groupNameRef}
                      maxLength={MAX_LENGTH.groupName}
                      value={values.groupName}
                      onChange={(event) => set("groupName", event.target.value)}
                    />
                  )}
                </Field>
              )}
            </div>
            <div className="pif-grid pif-grid--code">
              <Field label={TEXT.code} required hint={TEXT.codeHint}>
                {(control) => (
                  <Input
                    {...control}
                    ref={codeRef}
                    numeric
                    maxLength={MAX_LENGTH.code}
                    placeholder={TEXT.codePlaceholder}
                    value={values.code}
                    onChange={(event) => set("code", event.target.value)}
                  />
                )}
              </Field>
              <Field label={TEXT.sortOrder} hint={TEXT.sortOrderHint}>
                {(control) => (
                  <Input
                    {...control}
                    ref={sortOrderRef}
                    type="number"
                    numeric
                    min={0}
                    placeholder={String(defaultSortOrder)}
                    value={values.sortOrder}
                    onChange={(event) => set("sortOrder", event.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label={TEXT.description} required hint={TEXT.descriptionHint}>
              {(control) => (
                <Textarea
                  {...control}
                  ref={descriptionRef}
                  rows={3}
                  maxLength={MAX_LENGTH.description}
                  placeholder={TEXT.descriptionPlaceholder}
                  value={values.description}
                  onChange={(event) => set("description", event.target.value)}
                />
              )}
            </Field>
          </section>

          <section className="pif-card">
            <h3 className="pif-card__title">{TEXT.amountCard}</h3>
            <div className="pif-grid pif-grid--three pif-grid--flush">
              <Field label={TEXT.unit} required hint={TEXT.unitHint}>
                {(control) => (
                  <Select
                    {...control}
                    ref={unitRef}
                    value={values.unit}
                    onChange={(event) => set("unit", event.target.value)}
                  >
                    <option value="">{UNIT_PLACEHOLDER_OPTION}</option>
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={TEXT.quantity} required hint={TEXT.quantityHint}>
                {(control) => (
                  <Input
                    {...control}
                    ref={quantityRef}
                    // 🔴 TKL-F2.6a · K6: `type="number"` DEĞİL — tarayıcı Türkçe virgülü ""a indirger
                    // ve T30 kuralını (nokta=binlik) uygulatamaz; metin + `lib/tr-decimal`.
                    inputMode="decimal"
                    numeric
                    placeholder={TEXT.quantityPlaceholder}
                    value={values.quantity}
                    onChange={(event) => set("quantity", event.target.value)}
                  />
                )}
              </Field>
              <Field label={TEXT.unitPrice} required hint={TEXT.unitPriceHint}>
                {(control) => (
                  <Input
                    {...control}
                    ref={unitPriceRef}
                    // 🔴 TKL-F2.6a · K6: `type="number"` DEĞİL — tarayıcı Türkçe virgülü ""a indirger
                    // ve T30 kuralını (nokta=binlik) uygulatamaz; metin + `lib/tr-decimal`.
                    inputMode="decimal"
                    numeric
                    placeholder={TEXT.unitPricePlaceholder}
                    value={values.unitPrice}
                    onChange={(event) => set("unitPrice", event.target.value)}
                  />
                )}
              </Field>
            </div>

            {/* 169-175 · yalnız GÖRÜNTÜ */}
            <div className="pif-total pif-total--employer">
              <div className="pif-total__row">
                <span className="pif-total__label">{TEXT.lineTotal}</span>
                <span className="pif-total__value" data-testid="eci-line-total">
                  ₺ {formatAmount(preview ?? 0)}
                </span>
              </div>
              <p className="pif-total__hint">{TEXT.lineTotalHint}</p>
            </div>
          </section>

          {/* 178-200 · SALT-OKUNUR: sözleşmenin ayarı, poz onu devralır. */}
          <section className="pif-card">
            <h3 className="pif-card__title">{TEXT.escalationCard}</h3>
            <div className="pif-grid pif-grid--two pif-grid--flush">
              <Field label={TEXT.escalation} hint={TEXT.escalationHint}>
                {(control) => (
                  <Select
                    {...control}
                    disabled
                    value={detail.has_price_escalation ? "yes" : "no"}
                    data-testid="eci-escalation"
                    onChange={() => undefined}
                  >
                    <option value="yes">{ESCALATION_OPTIONS.yes}</option>
                    <option value="no">{ESCALATION_OPTIONS.no}</option>
                  </Select>
                )}
              </Field>
              <Field label={TEXT.indexType}>
                {(control) => (
                  <Select
                    {...control}
                    disabled
                    value={detail.index_type ?? ""}
                    data-testid="eci-index-type"
                    onChange={() => undefined}
                  >
                    <option value="">{INDEX_TYPE_EMPTY_OPTION}</option>
                    {INDEX_TYPE_ORDER.map((indexType) => (
                      <option key={indexType} value={indexType}>
                        {INDEX_TYPE_LABELS[indexType]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <p className="pif-readonly-note" data-testid="eci-escalation-reason">
              {ESCALATION_READONLY_REASON}
            </p>
          </section>
        </div>

        {/* ── SAĞ: özet (204-236) ────────────────────────────────────────── */}
        <aside className="pif__side">
          <section className="pif-card pif-card--flush">
            <h3 className="pif-card__subtitle">{TEXT.summaryCard}</h3>
            <div className="pif-summary">
              {/* Grup değeri mockup 208'de mono DEĞİL; 209-211 mono. */}
              <SummaryRow
                label={TEXT.summaryGroup}
                // Yeni grup seçiliyken özet, yazılmakta olan grup ADINI
                // gösterir — henüz kaydı olmayan grup için boş satır basılmaz.
                value={isNewGroup ? values.groupName.trim() : (selectedGroup?.name ?? "")}
                mono={false}
              />
              <SummaryRow label={TEXT.code} value={values.code.trim()} />
              <SummaryRow label={TEXT.summaryQuantity} value={values.quantity.trim()} />
              <SummaryRow
                label={TEXT.summaryUnitPrice}
                value={values.unitPrice.trim()}
              />
              <div className="pif-summary__amount">
                <span className="pif-summary__amount-label">{TEXT.summaryAmount}</span>
                <span className="pif-summary__amount-value" data-testid="eci-summary-amount">
                  ₺ {formatAmount(preview ?? 0)}
                </span>
              </div>
            </div>
          </section>

          <section className="pif-card pif-card--flush pif-card--muted">
            <h3 className="pif-card__subtitle">{TEXT.contractCard}</h3>
            <div className="pif-stats">
              <div className="pif-stats__row">
                <span className="pif-stats__label">{TEXT.contractItemCount}</span>
                <span className="pif-stats__value">{allItems.length}</span>
              </div>
              <div className="pif-stats__row">
                <span className="pif-stats__label">{TEXT.contractDistributedCount}</span>
                {/* Maskeli hâlde ton sınıfı da DÜŞER: yeşil/kehribar bir
                    OLUMLU/UYARI iddiasıdır ve bilinmeyen sayının üzerine
                    boyanmaz. */}
                <span
                  className={cx("pif-stats__value", distributedCount !== null && "pif-stats__value--ok")}
                >
                  {distributedCount ?? SUMMARY_DASH}
                </span>
              </div>
              <div className="pif-stats__row">
                <span className="pif-stats__label">{TEXT.contractUndistributedCount}</span>
                <span
                  className={cx(
                    "pif-stats__value",
                    distributedCount !== null && "pif-stats__value--warn",
                  )}
                >
                  {distributedCount === null ? SUMMARY_DASH : allItems.length - distributedCount}
                </span>
              </div>
              <div className="pif-stats__rule" />
              <div className="pif-stats__row">
                <span className="pif-stats__value">{TEXT.contractTotal}</span>
                <span className="pif-stats__total-value" data-testid="eci-contract-total">
                  {/* Sözleşme bedeli girilmemiş olabilir (şema nullable) — sessiz
                      sıfır YAZILMAZ. */}
                  {detail.amount === null ? SUMMARY_DASH : `₺ ${formatAmount(detail.amount)}`}
                </span>
              </div>
            </div>
          </section>

          <p className="pif-note pif-note--next">
            <strong>{TEXT.noteLead}</strong>
            {TEXT.noteBefore}
            <Link href={employerContractDistributionHref(projectId)}>{TEXT.noteLink}</Link>
            {TEXT.noteAfter}
          </p>
        </aside>
      </div>

      {formError && (
        <p className="pif__error" data-testid="eci-error">
          {formError}
        </p>
      )}
    </Modal>
  );
}
