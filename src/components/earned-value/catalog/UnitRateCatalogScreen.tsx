"use client";

import { useEffect, useState } from "react";

import { ErrorCard, ReadOnlyStrip, Skeleton, SkeletonRows } from "@/components/earned-value/common/state";
import { Button } from "@/components/ui";
import { BooksIcon } from "@/components/ui/icons";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { DISCIPLINES_EDIT, UNIT_RATE_CATALOG_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useEvCatalog } from "@/lib/api/hooks/useEvCatalog";
import { useEvDisciplines } from "@/lib/api/hooks/useEvDisciplines";
import type { EvCatalogItemRead } from "@/lib/api/models";

import { CatalogItemFormModal, type CatalogFormMode } from "./CatalogItemFormModal";
import { CatalogTable } from "./CatalogTable";
import { CatalogToolbar } from "./CatalogToolbar";
import { countByDiscipline, filterCatalogItems, summarizeCatalog } from "./catalog-model";
import { DisciplineManager } from "./DisciplineManager";
import "./catalog.css";
import "./catalog-modals.css";

/** B1-8: katalog + disiplin YAZMA = full; disiplin SİLME = admin (B1-9). */
/** KAT:437 — başarı bildiriminin ekranda kalma süresi. */
const TOAST_MS = 2800;
/** KAT:384-388 — dört satırlık tablo iskeleti. */
const SKELETON_COLUMNS = "1fr 60px 70px 50px";
const SKELETON_ROWS = 4;

/**
 * PLN-F1.5 · `/planlama/birim-oran-katalogu` — şirket geneli birim oran
 * kataloğu (KAT) + disiplin yönetimi (M6). Kabuk (sidebar, kırıntı) uygulamanın.
 *
 * Süzgeçler istemcide uygulanır: açılır listedeki disiplin sayıları ve üst
 * çipler TÜM kataloğu ister (KAT:520-525); tek istek, üç süzgeç.
 */
export function UnitRateCatalogScreen() {
  const { level } = useModulePermission("earned_value");
  // IZN-F5b · iş tipi ekle/düzenle (POST/PATCH /earned-value/catalog) = planlama.birim_oran_katalogu Düzenler.
  // "Disiplinleri yönet" modalı AYRI uca (/earned-value/disciplines) yazar: ekle/düzenle = planlama.disiplin_yonetimi
  // Düzenler; SİLME = yalnız sistem yöneticisi.
  const canWrite = useButtonGate({ pages: UNIT_RATE_CATALOG_EDIT, need: "edit" });
  const canWriteDisciplines = useButtonGate({ pages: DISCIPLINES_EDIT, need: "edit" });
  const canDelete = useButtonGate({ pages: DISCIPLINES_EDIT, need: "sa" });

  const catalog = useEvCatalog();
  const disciplines = useEvDisciplines();

  const [query, setQuery] = useState("");
  const [disciplineId, setDisciplineId] = useState<string | null>(null);
  const [onlyBig, setOnlyBig] = useState(false);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [formMode, setFormMode] = useState<CatalogFormMode | null>(null);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const items = catalog.data ?? [];
  const summary = summarizeCatalog(items);
  const counts = countByDiscipline(items);
  const visible = filterCatalogItems(items, { query, disciplineId, onlyBig });
  const catalogUnits = Array.from(new Set(items.map((item) => item.uom)));

  function toggleRow(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openNew() {
    setFormMode({ kind: "create", disciplineId });
  }

  function openEdit(item: EvCatalogItemRead) {
    setFormMode({ kind: "edit", item });
  }

  function handleSaved(message: string) {
    setFormMode(null);
    setToast(message);
  }

  return (
    <div className="ev-cat">
      <header className="ev-cat__head">
        <h1 className="ev-cat__title">Birim Oran Kataloğu</h1>
        <p className="ev-cat__lead">
          Şirket düzeyinde &quot;birim başına kaç adam-saat&quot; hafızası. Tamamlanan şantiyelerin gerçekleşen
          oranları burada birikir; Adam-Saat Bütçesi yeni projelerde buradan öneri alır.
        </p>
        {catalog.data && (
          <ul className="ev-cat__chips" aria-label="Katalog özeti">
            <li className="ev-cat__chip">
              <b>{summary.total}</b> iş tipi
            </li>
            <li className="ev-cat__chip">
              <b>{summary.withActual}</b> iş tipinde gerçekleşen veri
            </li>
            <li className="ev-cat__chip ev-cat__chip--danger">
              <b>{summary.bigDiff}</b> iş tipi standarttan %10+ farklı
            </li>
            <li className="ev-cat__chip">
              Tamamlanan şantiye <b>{summary.completedSites}</b>
            </li>
          </ul>
        )}
      </header>

      {!canWrite && (
        <ReadOnlyStrip>
          {level === "view"
            ? "Görüntüleyici · yalnız okuma"
            : "Salt okunur · kataloğu yalnız tam yetki (full) değiştirir"}
        </ReadOnlyStrip>
      )}

      <section className="ev-cat__card" aria-label="İş tipleri">
        <CatalogToolbar
          query={query}
          onQueryChange={setQuery}
          disciplines={disciplines.data ?? []}
          counts={counts}
          total={items.length}
          disciplineId={disciplineId}
          onDisciplineChange={setDisciplineId}
          onlyBig={onlyBig}
          onOnlyBigChange={setOnlyBig}
          canWrite={canWrite}
          canWriteDisciplines={canWriteDisciplines}
          onManageDisciplines={() => setIsManagerOpen(true)}
          onNewItem={openNew}
        />
        {toast && (
          <div className="ev-cat-toast" role="status">
            {toast}
          </div>
        )}
        <CatalogBody
          catalog={catalog}
          visible={visible}
          openIds={openIds}
          canWrite={canWrite}
          onToggle={toggleRow}
          onEdit={openEdit}
          onNew={openNew}
          onAdopted={setToast}
        />
        <CatalogLegend />
      </section>

      {formMode && (
        <CatalogItemFormModal
          mode={formMode}
          disciplines={disciplines.data ?? []}
          catalogUnits={catalogUnits}
          readOnly={!canWrite}
          onClose={() => setFormMode(null)}
          onSaved={handleSaved}
        />
      )}
      {isManagerOpen && (
        <DisciplineManager
          canWrite={canWriteDisciplines}
          canDelete={canDelete}
          onClose={() => setIsManagerOpen(false)}
        />
      )}
    </div>
  );
}

interface CatalogBodyProps {
  catalog: ReturnType<typeof useEvCatalog>;
  visible: readonly EvCatalogItemRead[];
  openIds: ReadonlySet<string>;
  canWrite: boolean;
  onToggle: (id: string) => void;
  onEdit: (item: EvCatalogItemRead) => void;
  onNew: () => void;
  onAdopted: (message: string) => void;
}

/** KAT:362-390 hâl varyantları + tablo. */
function CatalogBody({ catalog, visible, openIds, canWrite, onToggle, onEdit, onNew, onAdopted }: CatalogBodyProps) {
  const scope = useDisciplineScope();
  if (catalog.isLoading) {
    return (
      <div className="ev-cat__state">
        <Skeleton label="Katalog yükleniyor">
          <SkeletonRows columns={SKELETON_COLUMNS} count={SKELETON_ROWS} />
        </Skeleton>
      </div>
    );
  }
  if (catalog.isError || !catalog.data) {
    return (
      <div className="ev-cat__state">
        <ErrorCard
          title="Katalog yüklenemedi"
          description="Gerçekleşen oranlar hesaplanamadı. Standart oranlar değişmedi."
          onRetry={() => void catalog.refetch()}
          retrying={catalog.isFetching}
        />
      </div>
    );
  }
  if (catalog.data.length === 0 && scope.isRestricted) {
    // Disiplini atanmış kullanıcıda backend süzmesi kataloğu boşaltabilir (DSC-F1.3);
    // "Katalog boş / ilk iş tipini ekleyin" yanıltıcı olur.
    return (
      <div className="ev-cat__state">
        <RestrictedEmptyNotice names={scope.names} />
      </div>
    );
  }
  if (catalog.data.length === 0) {
    return (
      <div className="ev-cat__state">
        <div className="ev-cat-empty">
          <BooksIcon className="ev-cat-empty__icon" />
          <div className="ev-cat-empty__title">Katalog boş</div>
          <p className="ev-cat-empty__text">
            İlk iş tiplerinizi ekleyin; şantiyeler tamamlandıkça gerçekleşen oranlar burada birikecek.
          </p>
          {canWrite && (
            <Button size="sm" onClick={onNew}>
              + Yeni iş tipi
            </Button>
          )}
        </div>
      </div>
    );
  }
  if (visible.length === 0) {
    return <div className="ev-cat__no-rows">Filtreye uyan iş tipi yok.</div>;
  }
  return (
    <CatalogTable
      items={visible}
      openIds={openIds}
      canWrite={canWrite}
      onToggle={onToggle}
      onEdit={onEdit}
      onAdopted={onAdopted}
    />
  );
}

/** KAT:226-231 — fark açıklaması; ±%10 bandı sabit (K4). */
function CatalogLegend() {
  return (
    <div className="ev-cat-legend">
      <span>Fark = (geçmiş ort. − standart) ÷ standart</span>
      <span className="ev-cat-legend__item">
        <span className="ev-cat-diff ev-cat-diff--over">+%10 üstü</span>daha fazla saat gerekiyor
      </span>
      <span className="ev-cat-legend__item">
        <span className="ev-cat-diff ev-cat-diff--under">−%10 altı</span>standart fazla
      </span>
      <span className="ev-cat-legend__item">
        <span className="ev-cat-diff ev-cat-diff--normal">±%10</span>normal
      </span>
    </div>
  );
}
