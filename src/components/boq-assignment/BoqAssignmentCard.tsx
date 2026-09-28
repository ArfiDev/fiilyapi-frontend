"use client";

import { useState } from "react";

import { Button, Input } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { formatAmount, formatQuantity } from "@/lib/format";
import { multiplyDecimalStrings, normalizeDecimalInput, sumDecimalStrings } from "@/lib/decimal";
import { siteQuotaOf } from "@/lib/boq-quota";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { useBoq, type BoqItem } from "@/lib/api/hooks/useBoq";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import {
  fetchBoqItemAllocations,
  useReplaceBoqItemAllocations,
} from "@/lib/api/hooks/useBoqAllocations";

import { BoqItemPickerModal } from "./BoqItemPickerModal";
import { checkOvershoot, mergeSectionAllocation } from "./allocation-merge";
import {
  buildAssignmentRows,
  isQuantityMasked,
  sectionQuantityMap,
  type AssignmentRow,
} from "./rows";
import "./boq-assignment.css";

/**
 * 🔴 YENİ BÖLÜM OLUŞTURMA KİPİNİN GÖRÜNÜR GEREKÇESİ — ÖLÇÜLMÜŞ KISIT.
 *
 * Tahsis satırı `boq_item_section_allocations.section_id` NOT NULL'dır: bölüm
 * satırı var olmadan tahsis YAZILAMAZ. `SectionCreate` gövdesi de tahsis KABUL
 * ETMEZ (backend docstring: *"Mockup'ta görünüp burada OLMAYANLAR: BOQ
 * atamaları"*). Yani atama form gövdesine giremez, AYRI bir istektir.
 *
 * Seçenekler ölçüldü: (a) taslağı istemcide biriktirip bölüm oluştuktan sonra
 * N istek atmak — bölüm kaydedilir, tahsisler sessizce başarısız olabilir ve
 * kullanıcı yarım kaydedilmiş bir ekranla kalır; (b) oluşturma kipinde
 * kontrolleri GÖRÜNÜR GEREKÇEYLE kapatmak. (b) seçildi: yarım başarı
 * durumunda kullanıcıya YALAN söylenmez ve kart mockup yerleşimini korur.
 */
export const CREATE_MODE_DISABLED_REASON =
  "İş kalemi ataması bölüm kaydedildikten sonra yapılır — tahsis kaydı bölüme bağlıdır.";

/**
 * 🔴 METRAJ GİZLİ — atama yüzeyi GÖRÜNÜR GEREKÇEYLE kapanır (2026-09-19 denetimi).
 *
 * `boq` kapsamı `finance` olan rol (muhasebe) metrajı göremez: `quantity`,
 * `allocated_quantity` ve `unallocated_quantity` `null` gelir. Eskiden bu hâl
 * render sırasında ATIYORDU ve ekran BEYAZ kalıyordu (`lib/masked.ts` hikâyesi).
 *
 * Ekran artık AÇILIR — kullanıcı bölümün poz listesini, birimlerini ve (kapsamı
 * para görüyorsa) fiyatlarını okur; miktarlar "—" basılır. Ama YAZMA kapanır ve
 * gerekçe EKRANDA durur: görülmeyen bir kotanın üstüne tahsis yazmak, kullanıcının
 * bilmediği bir sayıyı değiştirmesi demektir.
 *
 * 🔴 `canWrite` tek başına YETMEZ ve bu ölçüldü: o bayrak `sites` modülünden
 * okunur (`SectionForm.tsx`), maske ise `boq` modülünün KAPSAMINDAN doğar —
 * `sites = full/all` + `boq = view/finance` atanabilir bir bileşimdir.
 */
export const MASKED_QUANTITY_REASON =
  "Metraj alanları bu rolde gizli — atanan miktarlar “—” basılır ve atama yapılamaz.";

/** Kart kendi kaydını yapar; form gövdesinden AYRIDIR ve bu söylenir. */
export const SEPARATE_SAVE_NOTE =
  "İş kalemi atamaları bölüm formundan ayrı kaydedilir.";

const COLUMNS = [
  "Poz No",
  "Poz Adı",
  "Birim",
  "Şantiye Kotası",
  "Bu Bölüme",
  "B. Fiyat",
  "Tutar",
] as const;

export type BoqAssignmentCardProps =
  | { mode: "create" }
  | { mode: "edit"; siteId: string; sectionId: string; canWrite: boolean };

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Kart iskeleti — iki kip de aynı yerleşimi basar (mockup F131-211). */
function CardShell({
  children,
  action,
  note,
}: {
  children: React.ReactNode;
  action: React.ReactNode;
  note: React.ReactNode;
}) {
  return (
    <section className="pf-card pf-card--flush sf-boq-card">
      <div className="sf-boq-card__head">
        <span className="sf-boq-card__title">📋 Bölüme Atanacak İş Kalemleri</span>
        <span className="sf-boq-card__badge">Şantiye poz listesinden</span>
        {action}
      </div>
      <div className="sf-boq-card__note">{note}</div>
      {children}
    </section>
  );
}

export function BoqAssignmentCard(props: BoqAssignmentCardProps) {
  if (props.mode === "create") {
    // 🔴 Kontroller SİLİNMEZ, devre dışı + GÖRÜNÜR gerekçeyle basılır (kanon).
    return (
      <CardShell
        note={CREATE_MODE_DISABLED_REASON}
        action={
          <Button type="button" variant="ghost" size="sm" disabled className="sf-boq-card__add">
            + Poz Seç
          </Button>
        }
      >
        <AssignmentTable rows={[]} draft={new Map()} onDraft={() => {}} disabled />
      </CardShell>
    );
  }
  return <LiveCard {...props} />;
}

function LiveCard({
  siteId,
  sectionId,
  canWrite,
}: {
  siteId: string;
  sectionId: string;
  canWrite: boolean;
}) {
  // İKİ SORGU, N+1 YOK:
  //  · süzgeçsiz → pozun GERÇEK kotası + dağıtılmış/dağıtılmamış (metadata)
  //  · süzgeçli  → BU bölümün payı (`quantity` maskelenir — BOQ-SEC K5)
  // İkisi ayrı önbellek anahtarındadır ve birbirini EZMEZ (`boqQueryKey`).
  const siteBoq = useBoq(siteId);
  const sectionBoq = useBoq(siteId, sectionId);
  const replace = useReplaceBoqItemAllocations(siteId);
  // 🔴 M5_1 kayıt #262: `canWrite` (üstten gelir) `sites` modülünden okunur,
  //    ama `PUT /boq/items/{id}/allocations` backend'de `boq` modülünün
  //    `full`+ eşiğini ister (router.py `_FULL` bağımlılığı). `sites:full +
  //    boq:view` kullanıcısı eskiden canAssign=true görüp 403 alıyordu.
  const boqPermission = useModulePermission("boq");

  const [draft, setDraft] = useState<ReadonlyMap<string, string>>(new Map());
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // SEKME-F1.3b — erken dönüşlerden ÖNCE (Rules of Hooks); taslak satır
  // varsa "Bu Bölüme" kolonunda commit edilmemiş miktar vardır.
  useUnsavedChanges(draft.size > 0, "Poz ataması");

  if (siteBoq.isError || sectionBoq.isError) {
    return (
      <CardShell note="İş kalemleri yüklenemedi." action={null}>
        <AssignmentTable rows={[]} draft={new Map()} onDraft={() => {}} disabled />
      </CardShell>
    );
  }
  if (siteBoq.isLoading || !siteBoq.data || sectionBoq.isLoading || !sectionBoq.data) {
    return (
      <CardShell note="Yükleniyor…" action={null}>
        <AssignmentTable rows={[]} draft={new Map()} onDraft={() => {}} disabled />
      </CardShell>
    );
  }

  const sectionQuantities = sectionQuantityMap(sectionBoq.data.groups);
  const rows = buildAssignmentRows(siteBoq.data.groups, sectionQuantities, draft);
  const hasChanges = draft.size > 0;
  // 🔴 `some` (FAIL-CLOSED): tek satırın metrajı bile gizliyse yazma yüzeyi
  //    tümden kapanır. Maske kapsam başınadır, yani pratikte hep-ya-hiçtir;
  //    karışık bir yanıt gelirse de kısmi bir kotaya yazmak kullanıcıyı
  //    göremediği bir toplamla karşı karşıya bırakırdı.
  const hasMaskedQuantity = rows.some(isQuantityMasked);
  const canAssignBoq = hasAtLeast(boqPermission.level, "full");
  const canAssign = canWrite && canAssignBoq && !hasMaskedQuantity;

  /**
   * 🔴 KAYDETME — poz BAŞINA, ve her poz için önce KÜMENİN TAMAMI okunur.
   *
   * Önbellekten okunmaz: `PUT` tam küme değiştirmedir, bayat bir küme üzerine
   * yazmak arada eklenmiş bir payı SESSİZCE siler.
   */
  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSavedNote(null);
    const failures: string[] = [];
    for (const [itemId, rawQuantity] of draft) {
      const row = rows.find((r) => r.item.id === itemId);
      const label = row?.item.code ?? itemId;
      const normalized = normalizeDecimalInput(rawQuantity);
      if (rawQuantity.trim() !== "" && normalized === null) {
        failures.push(`${label}: geçersiz miktar`);
        continue;
      }
      try {
        const current = await fetchBoqItemAllocations(itemId);
        await replace.mutateAsync({
          itemId,
          allocations: mergeSectionAllocation({
            current: current.allocations,
            sectionId,
            nextQuantity: normalized,
          }),
        });
      } catch (error: unknown) {
        // Sunucunun 409 gövdesi (ör. "Bölümlere dağıtılan miktar poz miktarını
        // aşamaz") AYNEN geçer — yutulmaz, uydurulmaz.
        //
        // 🔴 `mergeSectionAllocation` BU `try` içinde değerlendirilir ve bu
        //    bilinçlidir: maskeli bir pay gövdeye girmeye kalkarsa fren
        //    (`maskesiz`) burada atar ve kullanıcı GÖRÜNÜR bir hata bandı
        //    görür — sessiz bir çökme ya da sessiz bir veri kaybı değil.
        failures.push(`${label}: ${backendErrorMessage(error)}`);
      }
    }
    setSaving(false);
    if (failures.length > 0) {
      setSaveError(failures.join(" · "));
      return;
    }
    setDraft(new Map());
    setSavedNote("İş kalemi atamaları kaydedildi.");
  }

  function setRowQuantity(itemId: string, raw: string) {
    setSavedNote(null);
    setDraft((prev) => {
      const next = new Map(prev);
      next.set(itemId, raw);
      return next;
    });
  }

  const totalAmount = sumDecimalStrings(
    rows.map((row) => multiplyDecimalStrings(row.effectiveQuantity, row.item.unit_price)),
  );

  return (
    <CardShell
      note={
        <>
          {SEPARATE_SAVE_NOTE}
          {hasMaskedQuantity && <span className="sf-boq-card__muted"> {MASKED_QUANTITY_REASON}</span>}
          {savedNote && <span className="sf-boq-card__ok"> {savedNote}</span>}
        </>
      }
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="sf-boq-card__add"
          disabled={!canAssign}
          onClick={() => setPickerOpen(true)}
        >
          + Poz Seç
        </Button>
      }
    >
      <AssignmentTable
        rows={rows}
        draft={draft}
        onDraft={setRowQuantity}
        disabled={!canAssign || isSaving}
        totalAmount={totalAmount}
        onAddClick={() => setPickerOpen(true)}
      />

      {saveError && (
        <p className="sf-boq-card__error" role="alert">
          {saveError}
        </p>
      )}

      {hasChanges && (
        <div className="sf-boq-card__actions">
          <Button type="button" variant="secondary" disabled={isSaving} onClick={() => setDraft(new Map())}>
            Değişiklikleri geri al
          </Button>
          <Button type="button" variant="primary" disabled={isSaving || !canAssign} onClick={handleSave}>
            {isSaving ? "Kaydediliyor…" : "Atamaları Kaydet"}
          </Button>
        </div>
      )}

      {isPickerOpen && (
        <BoqItemPickerModal
          groups={siteBoq.data.groups}
          sectionQuantities={sectionQuantities}
          draft={draft}
          onClose={() => setPickerOpen(false)}
          onApply={(picked) => {
            setDraft(new Map(picked));
            setPickerOpen(false);
          }}
        />
      )}
    </CardShell>
  );
}

function AssignmentTable({
  rows,
  draft,
  onDraft,
  disabled,
  totalAmount,
  onAddClick,
}: {
  rows: readonly AssignmentRow[];
  draft: ReadonlyMap<string, string>;
  onDraft: (itemId: string, raw: string) => void;
  disabled: boolean;
  totalAmount?: string | null;
  onAddClick?: () => void;
}) {
  return (
    <table className="sf-boq-table">
      <caption className="sr-only">Bölüme atanacak iş kalemleri</caption>
      <thead>
        <tr>
          {COLUMNS.map((label) => (
            <th key={label} scope="col">
              {label}
            </th>
          ))}
          <th scope="col" />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={COLUMNS.length + 1} className="sf-boq-table__empty">
              Bu bölüme henüz iş kalemi atanmadı.
            </td>
          </tr>
        ) : (
          rows.map((row) => <AssignmentRowView key={row.item.id} row={row} draft={draft} onDraft={onDraft} disabled={disabled} />)
        )}
        <tr className="sf-boq-table__add-row">
          <td colSpan={COLUMNS.length + 1}>
            <button
              type="button"
              className="sf-boq-table__add-dashed"
              disabled={disabled || onAddClick === undefined}
              onClick={onAddClick}
            >
              <PlusIcon />
              Şantiye kotasından poz seç
            </button>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={COLUMNS.length}>BÖLÜM İŞ KALEMİ TOPLAMI</td>
          <td className="sf-boq-table__total">
            {totalAmount === undefined ? "—" : formatAmount(totalAmount)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function AssignmentRowView({
  row,
  draft,
  onDraft,
  disabled,
}: {
  row: AssignmentRow;
  draft: ReadonlyMap<string, string>;
  onDraft: (itemId: string, raw: string) => void;
  disabled: boolean;
}) {
  // 🔴 GÖSTERİM YOLU: `maskesiz()` BURADA ÇAĞRILMAZ (kanon: `lib/masked.ts`).
  //    Eskiden çağrılıyordu ve `boq = finance` rolünde bu satır render sırasında
  //    ATIYOR, error boundary olmadığı için TÜM SAYFAYI çökertiyordu.
  const isMasked = isQuantityMasked(row);
  // Tek hesap, iki kullanım (kota hücresi + aşım kontrolü) — iki ayrı çağrı
  // bir gün ayrışırdı.
  const siteQuota = siteQuotaOf(row.item);
  // `?? ""` yalnız MASKELİ dalda devreye girer ve o dalda kutu hiç basılmaz;
  // maskesiz satırda değer sunucudan/taslaktan gelir. Maskeli payı `"0"` diye
  // okumak "payı yok" yalanını söylerdi.
  const raw = draft.get(row.item.id) ?? row.sectionQuantity ?? "";
  const normalized = normalizeDecimalInput(raw);
  const check = checkOvershoot({
    siteQuota,
    allocatedTotal: row.item.allocated_quantity,
    sectionCurrentQuantity: row.sectionQuantity,
    nextQuantity: normalized,
  });
  const isInvalid = raw.trim() !== "" && normalized === null;
  const amount = multiplyDecimalStrings(row.effectiveQuantity, row.item.unit_price);

  return (
    <tr className={check.isOvershoot ? "sf-boq-table__row--over" : undefined}>
      <td>{row.item.code}</td>
      <td>
        {row.item.description}
        {check.isOvershoot && (
          <span className="sf-boq-table__warn">
            Kalan kotayı {formatQuantity(check.excess)} {row.item.unit} aşıyor — en fazla{" "}
            {formatQuantity(check.maxForSection)}
          </span>
        )}
      </td>
      <td className="sf-boq-table__center">{row.item.unit}</td>
      <td className="sf-boq-table__num">{formatQuantity(siteQuota)}</td>
      <td className="sf-boq-table__num">
        {/* 🔴 Maskeli satırda KUTU BASILMAZ. Boş ya da devre dışı bir kutu
            "pay yok / sıfır" diye okunurdu; hücre öbür maskeli sayılarla AYNI
            dili konuşur ve "—" basar (`lib/format.ts` kanonu). */}
        {isMasked ? (
          <span title={MASKED_QUANTITY_REASON}>{formatQuantity(row.sectionQuantity)}</span>
        ) : (
          <Input
            numeric
            size="row"
            inputMode="decimal"
            value={raw}
            disabled={disabled}
            status={check.isOvershoot || isInvalid ? "error" : "default"}
            aria-invalid={check.isOvershoot || isInvalid}
            aria-label={`${row.item.code} için bu bölüme atanan miktar`}
            onChange={(e) => onDraft(row.item.id, e.target.value)}
          />
        )}
      </td>
      <td className="sf-boq-table__num">{formatAmount(row.item.unit_price)}</td>
      <td className="sf-boq-table__num">{formatAmount(amount)}</td>
      <td>
        {/* Mockup F160 "×" — bu bölümden çıkarır. Sıfır YAZMAZ, satırı
            gövdeden düşürür (`quantity` STRICT pozitif). */}
        <button
          type="button"
          className="sf-boq-table__remove"
          disabled={disabled || isMasked}
          aria-label={`${row.item.code} pozunu bu bölümden çıkar`}
          onClick={() => onDraft(row.item.id, "")}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

export type { BoqItem };
