"use client";

import { useEffect, useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { BooksIcon, LockIcon } from "@/components/ui/icons";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { useCatalogDisciplines, useCatalogItems } from "@/lib/api/hooks/useCatalogItems";
import { isForbidden } from "@/lib/api/unwrap";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";
import { hasAtLeast, type AccessLevel } from "@/lib/auth/permissions";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { useModulePermission } from "@/lib/auth/useModulePermission";

import { WorkItemCatalogTabs } from "./WorkItemCatalogTabs";
import { WorkItemDisciplineChips } from "./WorkItemDisciplineChips";
import { WorkItemLegend } from "./WorkItemLegend";
import { WorkItemSearchBar } from "./WorkItemSearchBar";
import { WorkItemTable, type NewWorkItemRow } from "./WorkItemTable";
import { countByDiscipline, filterWorkItems, sortByPozNo, tabCounts } from "./work-item-model";
import "./work-item-catalog.css";

/** T25: katalog YAZMA = `contracts:full` + disiplin kısıtsız; okuma `contracts:view`. */
const WRITE_LEVEL = "full";
/** KIK:91-93 / :237 — başarı bildiriminin ekranda kalma süresi. */
const TOAST_MS = 2800;
const EXCEL_SOON_TITLE = "Yakında · Excel desteği sonraki sürümde açılacak";

/** ÜS-10 — şerit metni; yazma yetkisi yoksa nedene göre. */
function readOnlyMessage(level: AccessLevel | undefined, isRestricted: boolean): string {
  if (level === "view") return "Görüntüleyici · yalnız okuma";
  if (!hasAtLeast(level, WRITE_LEVEL)) return "Salt okunur · kataloğu yalnız Sözleşmeler tam yetkisi değiştirir";
  if (isRestricted) return "Salt okunur · disiplin kısıtlı kullanıcı kataloğu değiştiremez";
  return "";
}

/**
 * TKL-F1.3 · `/planlama/is-kalemi-katalogu` — şirket geneli FİYATLI iş kalemi kataloğu.
 * ÇEKİRDEK ekran (`earned-value` ithal etmez, §2.7). Fiyat gizleme backend'dedir:
 * `contracts:none` → erişim yok (403 dalı da); frontend yalnız yansıtır.
 */
export function WorkItemCatalogScreen() {
  const { level } = useModulePermission("contracts");
  if (level === "none") return <AccessDenied />;
  return <WorkItemCatalogContent level={level} />;
}

function WorkItemCatalogContent({ level }: { level: AccessLevel | undefined }) {
  const scope = useDisciplineScope();
  const canWrite = hasAtLeast(level, WRITE_LEVEL) && !scope.isRestricted;

  const catalog = useCatalogItems();
  const disciplineQuery = useCatalogDisciplines();

  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingIds, setEditingIds] = useState<ReadonlySet<string>>(new Set());
  const [newRows, setNewRows] = useState<readonly NewWorkItemRow[]>([]);
  const [newSequence, setNewSequence] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (isForbidden(catalog.error)) return <AccessDenied />;

  const items = catalog.data ?? [];
  const disciplines: readonly WorkDisciplineRead[] = [...(disciplineQuery.data ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code, "tr-TR"),
  );
  const counts = countByDiscipline(items);
  const visible = sortByPozNo(filterWorkItems(items, { query, disciplineId: activeId }));
  const catalogUnits = Array.from(new Set(items.map((item) => item.uom)));

  function openNew() {
    // KIK:285 — aktif çipin disiplini, "Tüm disiplinler"de İLK disiplin (sessizce).
    const discipline = disciplines.find((d) => d.id === activeId) ?? disciplines[0] ?? null;
    const key = newSequence + 1;
    setNewSequence(key);
    setNewRows((current) => [{ key, discipline }, ...current]);
    setQuery("");
  }

  function openEdit(item: WorkItemRead) {
    setEditingIds((current) => new Set(current).add(item.id));
  }

  function closeEdit(id: string) {
    setEditingIds((current) => new Set([...current].filter((openId) => openId !== id)));
  }

  function closeNew(key: number) {
    setNewRows((current) => current.filter((row) => row.key !== key));
  }

  function handleSaved(saved: WorkItemRead) {
    setToast(`${saved.poz_no} · ${saved.name} kaydedildi`);
  }

  const readOnlyText = canWrite ? "" : readOnlyMessage(level, scope.isRestricted);

  return (
    <div className="wik">
      <WorkItemCatalogTabs counts={catalog.data ? tabCounts(items, disciplines) : null} />

      <header className="wik__head">
        <div className="wik__titles">
          <h1 className="wik__title">İş Kalemi Kataloğu</h1>
          <p className="wik__lead">
            Şirket geneli poz listesi · teklif, sözleşme ve adam-saat bütçesi buradan kalem çeker
          </p>
        </div>
        <div className="wik__actions">
          <Button variant="secondary" disabled title={EXCEL_SOON_TITLE}>
            Excel İndir
          </Button>
          <Button variant="secondary" disabled title={EXCEL_SOON_TITLE}>
            Excel&apos;den İçe Aktar
          </Button>
          {canWrite && <Button onClick={openNew}>+ Kalem Ekle</Button>}
        </div>
      </header>

      {readOnlyText && (
        <div role="note" className="wik-readonly">
          <LockIcon className="wik-readonly__icon" />
          <span>{readOnlyText}</span>
        </div>
      )}

      {toast && (
        <div className="wik-toast" role="status">
          {toast}
        </div>
      )}

      <section className="wik__card" aria-label="İş kalemleri">
        <WorkItemDisciplineChips
          disciplines={disciplines}
          counts={counts}
          total={items.length}
          activeId={activeId}
          onChange={setActiveId}
          canWrite={canWrite}
        />
        <WorkItemSearchBar query={query} onQueryChange={setQuery} count={visible.length} />
        <WorkItemCatalogBody
          catalog={catalog}
          isRestricted={scope.isRestricted}
          restrictedNames={scope.names}
          canWrite={canWrite}
          onNew={openNew}
          table={{
            now: new Date(),
            items: visible,
            newRows,
            editingIds,
            canWrite,
            catalogUnits,
            onEdit: openEdit,
            onCloseEdit: closeEdit,
            onCloseNew: closeNew,
            onSaved: handleSaved,
          }}
        />
        <WorkItemLegend />
      </section>
    </div>
  );
}

type TableProps = Parameters<typeof WorkItemTable>[0];

interface WorkItemCatalogBodyProps {
  catalog: ReturnType<typeof useCatalogItems>;
  isRestricted: boolean;
  restrictedNames: string[];
  canWrite: boolean;
  onNew: () => void;
  table: TableProps;
}

/** KIK:128-181 hâl varyantları: yükleniyor · hata · boş · filtre boş · tablo. */
function WorkItemCatalogBody({
  catalog,
  isRestricted,
  restrictedNames,
  canWrite,
  onNew,
  table,
}: WorkItemCatalogBodyProps) {
  if (catalog.isLoading) return <p className="wik-state">Katalog yükleniyor</p>;
  if (catalog.isError || !catalog.data) {
    return (
      <div className="wik-state">
        <p>Katalog yüklenemedi</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void catalog.refetch()}
          disabled={catalog.isFetching}
        >
          Tekrar dene
        </Button>
      </div>
    );
  }
  if (catalog.data.length === 0 && table.newRows.length === 0) {
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
            <Button size="sm" onClick={onNew}>
              + Kalem Ekle
            </Button>
          )}
        </div>
      </div>
    );
  }
  if (table.items.length === 0 && table.newRows.length === 0) {
    return <div className="wik-no-rows">Filtreye uyan kalem yok.</div>;
  }
  return <WorkItemTable {...table} />;
}
