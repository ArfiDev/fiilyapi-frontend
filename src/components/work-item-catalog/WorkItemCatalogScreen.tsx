"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { BooksIcon, LockIcon } from "@/components/ui/icons";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { downloadCatalogExport } from "@/lib/api/catalog-export-client";
import { cx } from "@/lib/cx";
import { useCatalogDisciplines, useCatalogItems } from "@/lib/api/hooks/useCatalogItems";
import { isForbidden } from "@/lib/api/unwrap";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { CONTRACTS_VIEW, WORK_ITEM_CATALOG_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate, usePagePermission } from "@/lib/auth/usePagePermission";
import { useFileDownload } from "@/lib/use-file-download";

import { WorkItemDisciplineChips } from "./WorkItemDisciplineChips";
import { WorkItemLegend } from "./WorkItemLegend";
import { WorkItemSearchBar } from "./WorkItemSearchBar";
import { WorkItemTable, type WorkItemTableProps } from "./WorkItemTable";
import { useWorkItemDrafts } from "./useWorkItemDrafts";
import { filterNewDrafts, isNewDraft, type WorkItemDraft } from "./work-item-drafts";
import { countByDiscipline, filterWorkItems, sortByPozNo } from "./work-item-model";
import "./work-item-catalog.css";

/** T25: katalog YAZMA = `contracts:full` + disiplin kısıtsız; okuma `contracts:view`. */
/** KIK:91-93 / :237 — başarı bildiriminin ekranda kalma süresi. */
const TOAST_MS = 2800;
/** Yalnız "Excel'den İçe Aktar" için kalır (TKL-F4.3: "Excel İndir" açıldı). */
const EXCEL_SOON_TITLE = "Yakında · Excel desteği sonraki sürümde açılacak";

/** Katalog yüklenmeden önce `items` için kararlı boş liste (her render yeni dizi = memo kırılır). */
const NO_ITEMS: readonly WorkItemRead[] = [];

/** ÜS-10 — şerit metni; yazma yetkisi yoksa nedene göre. */
function readOnlyMessage(canView: boolean, canEdit: boolean, isRestricted: boolean): string {
  if (!canEdit) {
    return canView
      ? "Görüntüleyici · yalnız okuma"
      : "Salt okunur · kataloğu yalnız Sözleşmeler tam yetkisi değiştirir";
  }
  if (isRestricted) return "Salt okunur · disiplin kısıtlı kullanıcı kataloğu değiştiremez";
  return "";
}

/**
 * TKL-F1.3 · `/planlama/is-kalemi-katalogu` — şirket geneli FİYATLI iş kalemi kataloğu.
 * ÇEKİRDEK ekran (`earned-value` ithal etmez, §2.7). Fiyat gizleme backend'dedir:
 * `contracts:none` → erişim yok (403 dalı da); frontend yalnız yansıtır.
 */
export function WorkItemCatalogScreen() {
  // IZN-F5-ön · görüntüleme kapısı = sözleşme/teklif sayfaları Görür (VEYA); grant yoksa `contracts:none`.
  const canViewCatalog = useButtonGate({ pages: CONTRACTS_VIEW, need: "view" });
  if (!canViewCatalog) return <AccessDenied />;
  return <WorkItemCatalogContent />;
}

function WorkItemCatalogContent() {
  const scope = useDisciplineScope();
  // IZN-F2.x · katalog kalemi ekle/düzenle = teklif.is_kalemi_katalogu/sözleşme sayfaları Düzenler (VEYA) ∧ kısıtsız.
  const canEditCatalog = useButtonGate({ pages: WORK_ITEM_CATALOG_EDIT, need: "edit" });
  const canWrite = canEditCatalog && !scope.isRestricted;
  const canViewCatalog = usePagePermission(CONTRACTS_VIEW).canView;

  const exportDownload = useFileDownload();
  const catalog = useCatalogItems();
  const disciplineQuery = useCatalogDisciplines();

  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  /** `id` her bildirimde artar → AYNI metin tekrar gelse de 2800 ms sayacı sıfırlanır (KIK:237). */
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const disciplines: readonly WorkDisciplineRead[] = useMemo(
    () =>
      [...(disciplineQuery.data ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code, "tr-TR"),
      ),
    [disciplineQuery.data],
  );
  const drafts = useWorkItemDrafts({
    disciplines,
    onSaved: (saved) => setToast((current) => ({ text: `${saved.poz_no} · ${saved.name} kaydedildi`, id: (current?.id ?? 0) + 1 })),
  });

  const items = catalog.data ?? NO_ITEMS;
  // Arama kutusu ANINDA yansır (`query`); büyük listenin süzülmesi ertelenir (`deferredQuery`, KAT-F0 ölçümü: 1.700 kalemde tuş→paint 135 ms).
  const deferredQuery = useDeferredValue(query);
  const allNewDrafts = useMemo(() => drafts.drafts.filter(isNewDraft), [drafts.drafts]);
  const editDrafts: ReadonlyMap<string, WorkItemDraft> = useMemo(
    () => new Map(drafts.drafts.filter((draft) => !isNewDraft(draft)).map((draft) => [draft.key, draft])),
    [drafts.drafts],
  );
  // KIK:244, :277-279 — yeni satırlar listenin parçası: süzgece, "N kalem"e ve çip sayaçlarına girer.
  const visibleNew = useMemo(
    () => filterNewDrafts(allNewDrafts, { query: deferredQuery, disciplineId: activeId }),
    [allNewDrafts, deferredQuery, activeId],
  );
  const counts = useMemo(
    () => countByDiscipline(items, allNewDrafts.map((draft) => draft.disciplineId)),
    [items, allNewDrafts],
  );
  const visible = useMemo(
    () => sortByPozNo(filterWorkItems(items, { query: deferredQuery, disciplineId: activeId })),
    [items, deferredQuery, activeId],
  );
  const catalogUnits = useMemo(() => Array.from(new Set(items.map((item) => item.uom))), [items]);
  // `now` veri tazelendiğinde yenilenir; her render'da yeni `Date` satır memo'sunu kırardı.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [catalog.dataUpdatedAt]);
  const canAddRow = disciplineQuery.data !== undefined;

  if (isForbidden(catalog.error)) return <AccessDenied />;

  function openNew() {
    // KIK:285 — aktif çipin disiplini, "Tüm disiplinler"de İLK disiplin (sessizce); yalnız KİMLİĞİ saklanır.
    drafts.openNew(disciplines.find((d) => d.id === activeId) ?? disciplines[0] ?? null);
    setQuery("");
  }

  function retryLoad() {
    void catalog.refetch();
    void disciplineQuery.refetch();
  }

  const readOnlyText = canWrite ? "" : readOnlyMessage(canViewCatalog, canEditCatalog, scope.isRestricted);

  return (
    <div className="wik">
      <header className="wik__head">
        <div className="wik__titles">
          <h1 className="wik__title">İş Kalemi Kataloğu</h1>
          <p className="wik__lead">
            Şirket geneli poz listesi · teklif, sözleşme ve adam-saat bütçesi buradan kalem çeker
          </p>
        </div>
        <div className="wik__actions">
          {/* ÜS-F4-14: yalnız etkin disiplin sekmesi gider; arama metni (`q`) gitmez. */}
          <Button
            variant="secondary"
            disabled={exportDownload.isBusy}
            onClick={() => void exportDownload.start(() => downloadCatalogExport({ disciplineId: activeId }))}
          >
            {exportDownload.isBusy ? "İndiriliyor…" : "Excel İndir"}
          </Button>
          <Button variant="secondary" disabled title={EXCEL_SOON_TITLE}>
            Excel&apos;den İçe Aktar
          </Button>
          {canWrite && (
            <Button onClick={openNew} disabled={!canAddRow}>
              + Kalem Ekle
            </Button>
          )}
        </div>
      </header>

      {readOnlyText && (
        <div role="note" className="wik-readonly">
          <LockIcon className="wik-readonly__icon" />
          <span>{readOnlyText}</span>
        </div>
      )}

      {(exportDownload.notice ?? exportDownload.error) !== null && (
        <div className={cx("wik-toast", exportDownload.error !== null && "wik-toast--error")} role="status">
          {exportDownload.notice ?? exportDownload.error}
        </div>
      )}

      {toast && (
        <div className="wik-toast" role="status">
          {toast.text}
        </div>
      )}

      <section className="wik__card" aria-label="İş kalemleri">
        <WorkItemDisciplineChips
          disciplines={disciplines}
          counts={counts}
          total={items.length + allNewDrafts.length}
          activeId={activeId}
          onChange={setActiveId}
          canWrite={canWrite}
        />
        <WorkItemSearchBar query={query} onQueryChange={setQuery} count={visible.length + visibleNew.length} />
        <WorkItemCatalogBody
          catalog={catalog}
          hasDisciplineError={disciplineQuery.isError}
          isRetrying={catalog.isFetching || disciplineQuery.isFetching}
          onRetry={retryLoad}
          isRestricted={scope.isRestricted}
          restrictedNames={scope.names}
          canWrite={canWrite}
          canAddRow={canAddRow}
          onNew={openNew}
          newDraftCount={allNewDrafts.length}
          table={{
            now,
            items: visible,
            newDrafts: visibleNew,
            editDrafts,
            disciplines,
            canWrite,
            catalogUnits,
            onEdit: drafts.openEdit,
            onPatch: drafts.patch,
            onCancel: drafts.cancel,
            onSave: (key) => void drafts.save(key),
          }}
        />
        <WorkItemLegend />
      </section>
    </div>
  );
}

interface WorkItemCatalogBodyProps {
  catalog: ReturnType<typeof useCatalogItems>;
  /** Disiplin isteği hata verdi (kalem verisi olsa da bant gösterilir). */
  hasDisciplineError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  isRestricted: boolean;
  restrictedNames: string[];
  canWrite: boolean;
  /** Disiplinler yüklendi mi — yüklenmeden satır eklenmez. */
  canAddRow: boolean;
  onNew: () => void;
  /** Süzgeçten bağımsız TÜM yeni satır taslakları (boş katalogda tablo açık kalsın). */
  newDraftCount: number;
  table: WorkItemTableProps;
}

/** "Katalog yüklenemedi" + "Tekrar dene" — tam kutu (veri yok) ve veri varken BANT aynı onaylı metni kullanır. */
function LoadFailure({ isRetrying, onRetry }: { isRetrying: boolean; onRetry: () => void }) {
  return (
    <div className="wik-state">
      <p>Katalog yüklenemedi</p>
      <Button variant="secondary" size="sm" onClick={onRetry} disabled={isRetrying}>
        Tekrar dene
      </Button>
    </div>
  );
}

/** KIK:128-181 hâl varyantları: yükleniyor · hata · boş · filtre boş · tablo. */
function WorkItemCatalogBody(props: WorkItemCatalogBodyProps) {
  const { catalog, hasDisciplineError, isRetrying, onRetry } = props;
  if (catalog.isLoading) return <p className="wik-state">Katalog yükleniyor</p>;
  // Tam kutu YALNIZ veri yokken; veri varken (arka plan tazelemesi / disiplin hatası) tablo ve taslaklar kalır.
  if (!catalog.data) return <LoadFailure isRetrying={isRetrying} onRetry={onRetry} />;
  const hasBand = catalog.isError || hasDisciplineError;
  return (
    <>
      {hasBand && <LoadFailure isRetrying={isRetrying} onRetry={onRetry} />}
      <WorkItemCatalogRows {...props} data={catalog.data} />
    </>
  );
}

function WorkItemCatalogRows({
  data,
  isRestricted,
  restrictedNames,
  canWrite,
  canAddRow,
  onNew,
  newDraftCount,
  table,
}: WorkItemCatalogBodyProps & { data: readonly WorkItemRead[] }) {
  if (data.length === 0 && newDraftCount === 0) {
    if (isRestricted) {
      // Disiplini atanmış kullanıcıda backend süzmesi kataloğu boşaltabilir;
      // "Katalog boş / ilk kalemlerinizi ekleyin" yanıltıcı olur (KAT emsali).
      return (
        <div className="wik-state">
          <RestrictedEmptyNotice names={restrictedNames} />
        </div>
      );
    }
    return (
      <div className="wik-state">
        <div className="wik-empty">
          <BooksIcon className="wik-empty__icon" />
          <div className="wik-empty__title">Katalog boş</div>
          <p className="wik-empty__text">İlk iş kalemlerinizi ekleyin; teklif ve sözleşme buradan kalem çeker.</p>
          {canWrite && (
            <Button size="sm" onClick={onNew} disabled={!canAddRow}>
              + Kalem Ekle
            </Button>
          )}
        </div>
      </div>
    );
  }
  if (table.items.length === 0 && table.newDrafts.length === 0) {
    return <div className="wik-no-rows">Filtreye uyan kalem yok.</div>;
  }
  return <WorkItemTable {...table} />;
}
