"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { FormActions } from "@/components/form-shell";
import { Button, Checkbox } from "@/components/ui";
import { isoDate } from "@/components/site-diary/derive";
import { STOCK_LIST_MAX_LIMIT, useStockItems } from "@/lib/api/hooks/useStockItems";
import { useCreateStockEntry } from "@/lib/api/hooks/useStockMutations";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { useUserOptions } from "@/lib/api/hooks/useUserOptions";
import { useWarehouses } from "@/lib/api/hooks/useWarehouses";
import { stockErrorMessage } from "@/lib/api/stock-error";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import {
  isUserListUnavailable,
  userPickerNote,
} from "@/components/site-form/user-picker";

import { buildStockEntryBody } from "./build-body";
import {
  STOCK_ENTRY_BOQ_LOAD_ERROR,
  STOCK_ENTRY_NO_SECTION_NOTICE,
  STOCK_ENTRY_NO_WAREHOUSE_NOTICE,
  STOCK_ENTRY_SECTION_LOAD_ERROR,
  STOCK_ENTRY_NOTIFY_LABEL,
  STOCK_ENTRY_NOTIFY_PENDING_REASON,
  STOCK_ENTRY_SUBTITLE,
  STOCK_ENTRY_TITLE,
  STOCK_ENTRY_WAREHOUSE_LOAD_ERROR,
} from "./constants";
import {
  addStockEntryLine,
  applyEntryTypeToLines,
  emptyStockEntryFormValues,
  removeStockEntryLine,
  updateStockEntryLine,
  type StockEntryFormValues,
  type StockEntryLineValues,
} from "./form-state";
import { StockEntryDocumentsCard } from "./StockEntryDocumentsCard";
import { StockEntryInfoCard } from "./StockEntryInfoCard";
import { StockEntryLinesCard } from "./StockEntryLinesCard";
import { StockEntryTypeCards } from "./StockEntryTypeCards";
import {
  firstStockEntryError,
  hasStockEntryErrors,
  validateStockEntryForm,
  type StockEntryFormErrors,
} from "./validate";
import { defaultWarehouseId } from "./warehouse-options";
// Sıra önemli: önce paylaşılan kabuk, sonra forma özgü bloklar.
import "@/styles/form-shell.css";
import "./stock-entry-form.css";
import { routes } from "@/lib/routes";

const EMPTY_ERRORS: StockEntryFormErrors = { lineErrors: {} };

/**
 * SG — Stok Girişi formu (`projedesign/Form - Stok Girisi.dc.html`, kanonik).
 * Yorumlardaki sayılar O DOSYANIN satır numaralarıdır.
 *
 * Rota: `.../projeler/{projectId}/santiyeler/{siteId}/stok/giris`
 * (spec §5 **S4**, T3'ün `siteStockEntryHref` sözleşmesi).
 *
 * ⚠️ **QUERY PARAMETRESİ YOKTUR** — şantiye bağlamı ROTADAN okunur ve depo
 * `useParams().siteId` ile ön doldurulur. Bu bilinçli bir karardır (T3
 * devri); `?site=` gibi bir parametre EKLENMEZ.
 *
 * ⚠️ Sayfa KENDİ LAYOUT'UNU KURMAZ: `pf-shell` tam sayfa form kabuğudur
 * (SectionForm/SiteCreateView emsali) ve mockup'ın kendi üst barı (31-42)
 * yeniden çizilmez — breadcrumb + iki eylem düğmesi kabuk canonuna oturur.
 */
export function StockEntryForm() {
  const router = useRouter();
  // 🔴 URL-3 — ADRES anahtarlari.
  const { projectId: projectKey, siteId: siteKey } = useParams<{
    projectId: string;
    siteId: string;
  }>();

  const permission = useModulePermission("inventory");
  const siteQuery = useSite(siteKey, { project: projectKey });
  // 🔴 SLUG -> KANONIK KIMLIK. Burada AYRICA bir SESSIZ kusur kapaniyor:
  // `defaultWarehouseId(...)` asagida `warehouse.site_id` (UUID) ile
  // KARSILASTIRMA yapar. Adres anahtari slug oldugunda o karsilastirma HIC
  // tutmaz ve form varsayilan deposunu sessizce kaybeder — hata yok, 422 yok,
  // yalnizca bos kalan bir alan.
  const siteId = siteQuery.data?.id ?? "";
  // Kırpılma korkuluğu (TB3/F-TH dersi): sunucu varsayılanı 50'dir.
  const warehousesQuery = useWarehouses({ limit: STOCK_LIST_MAX_LIMIT });
  const itemsQuery = useStockItems({ isActive: true, limit: STOCK_LIST_MAX_LIMIT });
  const users = useUserOptions();
  // 🔴 STOK-BOLUM — atıf seçeneklerinin KAYNAĞI.
  //
  // İkisi de ROTANIN şantiyesine kapsanır ve bu bir DARALTMA DEĞİL, 422'nin
  // ÖNLENMESİDİR: backend, hareket ŞANTİYELİ bir depoya yazılıyorsa bölümün ve
  // pozun O şantiyeye ait olmasını ZORUNLU tutar (fail-closed, 422). Başka
  // şantiyenin bölümünü listelemek kullanıcıyı doğrudan 422'ye çarptırırdı.
  //
  // ⚠️ MERKEZ DEPO SINIRI (bilinçli, raporlandı): merkez depoda (`site_id`
  // NULL) backend şantiye çapası ARAMAZ, yani teknik olarak BAŞKA şantiyenin
  // bölümü de kabul edilirdi. Form yine de rotanın şantiyesiyle kapsar —
  // "A-Blok şantiyesinin stok girişi" formunda başka şantiyenin bölümlerini
  // listelemek kullanıcı için anlamsız olurdu. Sözleşme DARALTILMADI; yalnız
  // SEÇENEK LİSTESİ kapsandı.
  const sectionsQuery = useSiteSections(siteId);
  const boqQuery = useBoq(siteId);
  const createEntry = useCreateStockEntry();

  // Tarih `new Date()`ten TEK yerde türetilir (site-diary `isoDate` deseni:
  // `toISOString()` UTC'ye çevirip günü geri atardı).
  const [values, setValues] = useState<StockEntryFormValues>(() =>
    emptyStockEntryFormValues(isoDate(new Date())),
  );
  // SEKME-F1.3b · dirty (tercih 1, "touched" bayrağı yerine taban-aynalama):
  // taban `values`in İLK haliyle başlar. 🔴 ASYNC TABAN KISMEN — depo ön
  // doldurma aşağıdaki efektte OTOMATİK olur ve "kullanıcı dokunuşu"
  // SAYILMAMALI; bu yüzden efekt `baseline`ı da AYNI koşulla (yalnız
  // `warehouseId === ""` iken) günceller — otomatik dolan alan taban ile
  // birlikte kayar, dirty SAHTE true üretmez. Gerçek kullanıcı değişikliği
  // `handleChange`/satır fonksiyonları `values`i tabandan AYIRIR.
  const [baseline, setBaseline] = useState<StockEntryFormValues>(values);
  const isDirty = JSON.stringify(values) !== JSON.stringify(baseline);
  // Hook koşulsuz, erken dönüşlerden (aşağıda, `AccessDenied`) ÖNCE çağrılır.
  useUnsavedChanges(isDirty, "Stok girişi");
  const [errors, setErrors] = useState<StockEntryFormErrors>(EMPTY_ERRORS);
  const [formError, setFormError] = useState<string | null>(null);
  const lineSeqRef = useRef(1);

  // Depo ÖN DOLDURMA — YALNIZ BİR KEZ (SectionForm tohumlama deseni):
  // sonraki liste yenilemeleri kullanıcının seçimini EZMEZ.
  const seededRef = useRef(false);
  const warehouses = warehousesQuery.data?.items;
  useEffect(() => {
    if (seededRef.current) return;
    if (!warehouses) return;
    // 🔴 YARIŞ — `siteId` AYRI bir sorgudan (`useSite`) gelir ve depo listesi
    // önce dönerse o an henüz `""`dır. Kimlik gelmeden tohumlanmış SAYILIRSA
    // hiçbir depo eşleşmez, `prefill` null kalır ve kimlik sonradan geldiğinde
    // efekt erken döner: form varsayılan deposunu SESSİZCE kaybeder.
    if (!siteId) return;
    seededRef.current = true;
    const prefill = defaultWarehouseId(warehouses, siteId);
    // Kimlik beklenirken kullanıcı depo seçmiş olabilir: geç gelen tohum onun
    // seçimini EZMEZ (yalnız DOKUNULMAMIŞ alan doldurulur).
    if (prefill) {
      setValues((prev) => (prev.warehouseId === "" ? { ...prev, warehouseId: prefill } : prev));
      setBaseline((prev) => (prev.warehouseId === "" ? { ...prev, warehouseId: prefill } : prev));
    }
  }, [warehouses, siteId]);

  const shouldFocusRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  if (!permission.canWrite) return <AccessDenied />;
  if (isForbidden(siteQuery.error) || isForbidden(warehousesQuery.error)) {
    return <AccessDenied />;
  }

  const site = siteQuery.data;
  const siteStockHref = routes.projects.sites.stock({ projectId: projectKey, siteId: siteKey });
  const warehouseRows = warehouses ?? [];
  const items = itemsQuery.data?.items ?? [];

  // Bölüm seçenekleri — kod varsa ada eklenir (bölüm listelerinin tek deseni).
  const sectionOptions = (sectionsQuery.data?.items ?? []).map((section) => ({
    id: section.id,
    label: section.code ? `${section.code} · ${section.name}` : section.name,
  }));
  // 🔴 Poz seçenekleri BÖLÜME GÖRE SÜZÜLMEZ: `useBoq` süzgeçsiz çağrılır ve
  // tahsis (`boq_item_section_allocations`) HİÇ okunmaz. Backend fail-open'dır
  // ("kayıt, planın rehinesi olmaz") ve istemci o kararı daraltmaz.
  // Yan fayda: sorgu anahtarı şantiye BOQ ekranıyla AYNI kalır, önbellek paylaşılır.
  const boqOptions = (boqQuery.data?.groups ?? []).flatMap((group) =>
    group.items.map((item) => ({
      id: item.id,
      label: `${item.code} · ${item.description}`,
    })),
  );

  // Sessiz boş açılır liste YASAK — her durum görünür bir cümleyle anlatılır.
  //
  // 🔴 M5_3 #326 — `sectionsQuery`/`boqQuery` `siteId` gelene kadar
  // `enabled: false`dır; devre dışı sorguda `isFetching`/`isLoading` de
  // `false`e döner. `!siteId` kontrolü OLMADAN bu dal atlanır ve sayfa
  // açılışında (siteQuery hâlâ yüklenirken, `siteId === ""`) hiçbir bölüm
  // olgusal olmadan "Bölüm tanımlı değil" notu basılırdı.
  const attributionNote = sectionsQuery.isError
    ? STOCK_ENTRY_SECTION_LOAD_ERROR
    : boqQuery.isError
      ? STOCK_ENTRY_BOQ_LOAD_ERROR
      : !siteId || sectionsQuery.isLoading || boqQuery.isLoading
        ? "Bölüm ve iş kalemi listeleri yükleniyor…"
        : sectionOptions.length === 0
          ? STOCK_ENTRY_NO_SECTION_NOTICE
          : null;

  // Sessiz boş açılır liste YASAK: her durum görünür bir cümleyle anlatılır.
  //
  // 🔴 M5_3 #325 — `defaultWarehouseId` `warehouse.site_id === siteId`
  // eşleşmesi arar; `siteQuery` hâlâ yüklenirken `siteId === ""` olduğu için
  // hiçbir depo eşleşmez ve depo listesi `warehousesQuery`den ÖNCE dolarsa
  // kullanıcı gerçekte depo tanımlıyken geçici olarak "depo yok" notu görürdü.
  const warehouseNotice = warehousesQuery.isError
    ? STOCK_ENTRY_WAREHOUSE_LOAD_ERROR
    : !warehousesQuery.isLoading &&
        !!siteId &&
        defaultWarehouseId(warehouseRows, siteId) === null
      ? STOCK_ENTRY_NO_WAREHOUSE_NOTICE
      : null;

  const itemsNote = itemsQuery.isError
    ? "Malzeme kartı listesi yüklenemedi — sayfayı tazeleyip tekrar deneyin."
    : itemsQuery.isLoading
      ? "Malzeme kartları yükleniyor…"
      : items.length === 0
        ? "Hiç malzeme kartı yok — “Stok & Depo” ekranındaki “+ Malzeme Ekle” ile bir kart açın."
        : null;

  function handleChange<K extends keyof StockEntryFormValues>(
    field: K,
    value: StockEntryFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleAddLine() {
    setValues((prev) => addStockEntryLine(prev, lineSeqRef.current));
    lineSeqRef.current += 1;
  }

  function handleRemoveLine(key: string) {
    setValues((prev) => removeStockEntryLine(prev, key));
  }

  function handleChangeLine(key: string, patch: Partial<Omit<StockEntryLineValues, "key">>) {
    setValues((prev) => updateStockEntryLine(prev, key, patch));
  }

  function handleCancel() {
    router.push(siteStockHref);
  }

  function handleSubmit() {
    const nextErrors = validateStockEntryForm(values);
    setErrors(nextErrors);
    if (hasStockEntryErrors(nextErrors)) {
      shouldFocusRef.current = true;
      setFormError(firstStockEntryError(nextErrors));
      return;
    }
    setFormError(null);

    createEntry.mutate(buildStockEntryBody(values), {
      // Başarıda bakiye/durum taşıyan ÜÇ sorgu `useCreateStockEntry` içinde
      // geçersiz kılınır (T1) — ekran ikinci bir invalidation ÇAĞIRMAZ.
      onSuccess: () => router.push(siteStockHref),
      // ST §4b kanonu: 404 gövde içi VARLIK referansı (depo/kaynak depo/
      // malzeme/teslim alan) · 422 biçim-kural ihlali. İkisi de Türkçe ve
      // GÖRÜNÜR basılır; görünmeyen ile var olmayan kimlik AYNI gövdeyi alır.
      onError: (error) => setFormError(stockErrorMessage(error)),
    });
  }

  const isSaving = createEntry.isPending;

  return (
    <div className="pf-shell">
      {/* 31-42 — kabuk canonuna oturtulmuş üst şerit */}
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          <Link href={routes.stock()}>Stok &amp; Depo</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <Link href={siteStockHref}>{site ? site.name : "Şantiye"}</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="pf-breadcrumb__current" aria-current="page">
            {STOCK_ENTRY_TITLE}
          </span>
        </nav>
        <div className="pf-topbar__actions">
          <Button
            variant="secondary"
            className="pf-topbar-cancel"
            onClick={handleCancel}
            disabled={isSaving}
          >
            İptal
          </Button>
          <Button
            variant="primary"
            className="pf-topbar-submit"
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? "Kaydediliyor…" : "Girişi Kaydet"}
          </Button>
        </div>
      </div>

      <div className="pf">
        <header className="pf-head">
          {/* 47-48 */}
          <h1 className="pf-title">{STOCK_ENTRY_TITLE}</h1>
          <p className="pf-subtitle">{STOCK_ENTRY_SUBTITLE}</p>
        </header>

        {warehouseNotice && (
          <p className="sgf-notice" data-testid="stok-giris-depo-uyari">
            {warehouseNotice}
          </p>
        )}

        <div className="pf-body" data-testid="stok-giris-body" ref={bodyRef}>
          <StockEntryTypeCards
            value={values.entryType}
            // 🔴 Tip DEĞİŞİNCE satırların atfı SİLİNİR (`transfer`a geçişte).
            // `handleChange("entryType", …)` YETMEZ: eski bölüm seçimi durumda
            // kalır ve tip geri değiştirilince hayalet gibi geri gelirdi.
            onChange={(entryType) =>
              setValues((prev) => applyEntryTypeToLines(prev, entryType))
            }
          />
          <StockEntryInfoCard
            values={values}
            errors={errors}
            onChange={handleChange}
            warehouses={warehouseRows}
            siteId={siteId}
            warehousesDisabled={warehousesQuery.isLoading || warehousesQuery.isError}
            users={{
              options: users.options,
              isLoading: users.isLoading,
              isError: users.isError,
              isForbidden: users.isForbidden,
              note: userPickerNote({
                options: users.options,
                isLoading: users.isLoading,
                isError: isUserListUnavailable(users),
                isForbidden: users.isForbidden,
              }),
            }}
          />
          <StockEntryLinesCard
            values={values}
            errors={errors}
            items={items}
            itemsDisabled={itemsQuery.isLoading || itemsQuery.isError}
            itemsNote={itemsNote}
            sections={sectionOptions}
            boqItems={boqOptions}
            sectionAttributionDisabled={sectionsQuery.isLoading || sectionsQuery.isError}
            boqAttributionDisabled={boqQuery.isLoading || boqQuery.isError}
            attributionNote={attributionNote}
            onAddLine={handleAddLine}
            onRemoveLine={handleRemoveLine}
            onChangeLine={handleChangeLine}
          />
          <StockEntryDocumentsCard
            note={values.note}
            error={errors.note}
            onChangeNote={(note) => handleChange("note", note)}
          />
        </div>

        {formError && (
          <p className="pf-form-error" data-testid="stok-giris-hata">
            {formError}
          </p>
        )}

        <FormActions
          variant="split"
          leading={
            // 176 — SA'ya pending. ⚠️ Mockup kutucuğu SEÇİLİ çizer; burada
            // SEÇİLMEDEN basılır: bildirim GÖNDERİLMEYECEKTİR ve seçili bir
            // kutu "gönderilecek" der. Gerekçe `title`da + etiketin yanında
            // görünür. Gövdeye HİÇBİR anahtar eklemez.
            <span className="sgf-notify">
              <Checkbox
                size="lg"
                disabled
                checked={false}
                readOnly
                title={STOCK_ENTRY_NOTIFY_PENDING_REASON}
                data-testid="stok-giris-bildirim"
                label={STOCK_ENTRY_NOTIFY_LABEL}
              />
              <span className="sgf-notify__reason">{STOCK_ENTRY_NOTIFY_PENDING_REASON}</span>
            </span>
          }
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          submitLabel="Girişi Kaydet"
          pendingLabel="Kaydediliyor…"
          isPending={isSaving}
        />
      </div>
    </div>
  );
}
