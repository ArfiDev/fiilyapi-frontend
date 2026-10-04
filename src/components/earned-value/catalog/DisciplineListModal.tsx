"use client";

import { Modal } from "@/components/settings/Modal";
import { ErrorCard, ReadOnlyStrip, Skeleton, SkeletonRows } from "@/components/earned-value/common/state";
import { Button } from "@/components/ui";
import { cx } from "@/lib/cx";
import type { EvDisciplineRead } from "@/lib/api/models";

import { ContractorBadge, DisciplineSwatch } from "@/components/catalog-shared/CatalogBits";

export interface DisciplineListPanelProps {
  disciplines: readonly EvDisciplineRead[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** B1-8: full ve üstü — ekle / düzenle. */
  canWrite: boolean;
  /** B1-9: admin — sil. */
  canDelete: boolean;
  toast: string | null;
  onAdd: () => void;
  onEdit: (discipline: EvDisciplineRead) => void;
  onDelete: (discipline: EvDisciplineRead) => void;
}

interface DisciplineListModalProps extends DisciplineListPanelProps {
  onClose: () => void;
}

/** Katalog iskeleti ile aynı ölçü (KAT:384 · M6:381). */
const SKELETON_COLUMNS = "1fr 60px 70px 50px";
const SKELETON_ROWS = 3;

/**
 * M6:147-221 — "Disiplinler" liste modalı.
 *
 * "Kullanan" sütunu (M6:190-193): `used_by_item_count` iş tipi · altında
 * `used_by_site_count` şantiye — ikisi de API'den (PLN-B2 sözleşmesi,
 * PLN-F1.5.2'de bağlandı; önceki turdaki katalogdan türetme kalktı). Sil
 * yalnız ikisi de 0 iken açıktır (B1-9); gerekçe düğmenin altında düz metin
 * (M6:204). Yarışta kullanım doğarsa backend 409 döner, onay modalında gösterilir.
 */
export function DisciplineListModal({ onClose, ...panel }: DisciplineListModalProps) {
  const footer = (
    <Button variant="secondary" onClick={onClose}>
      Kapat
    </Button>
  );

  return (
    <Modal title="Disiplinler" onClose={onClose} footer={footer} className="ev-cat-modal--list">
      <DisciplineListPanel {...panel} />
    </Modal>
  );
}

/** M6 liste gövdesi — modalda (Birim Oran Kataloğu) ve sayfada (NAV-F2 · Disiplin Yönetimi) AYNI. */
export function DisciplineListPanel({
  disciplines,
  isLoading,
  isError,
  onRetry,
  canWrite,
  canDelete,
  toast,
  onAdd,
  onEdit,
  onDelete,
}: DisciplineListPanelProps) {
  return (
    <>
      <div className="ev-cat-modal__intro">
        <p className="ev-cat-modal__subtitle">Şirket listesi · bütün şantiyelerde ve katalogda ortak</p>
        {canWrite && <Button onClick={onAdd}>+ Yeni disiplin</Button>}
      </div>
      <div className="ev-cat-modal__body">
        {!canWrite && (
          <ReadOnlyStrip>Salt okunur · disiplin listesini yalnız tam yetki (full) değiştirir</ReadOnlyStrip>
        )}
        {toast && (
          <div className="ev-cat-toast ev-cat-toast--inline" role="status">
            {toast}
          </div>
        )}
        {isLoading && (
          <Skeleton label="Disiplinler yükleniyor">
            <SkeletonRows columns={SKELETON_COLUMNS} count={SKELETON_ROWS} />
          </Skeleton>
        )}
        {isError && (
          <ErrorCard
            title="Disiplinler yüklenemedi"
            description="Liste değişmedi. Bağlantıyı kontrol edip tekrar deneyin."
            onRetry={onRetry}
          />
        )}
        {disciplines && disciplines.length === 0 && (
          <div className="ev-cat-empty">
            <div className="ev-cat-empty__swatches" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="ev-cat-empty__title">Disiplin yok</div>
            <p className="ev-cat-empty__text">
              İş tipi eklemek ve bütçede BOQ gruplarını eşlemek için önce disiplin ekleyin.
            </p>
          </div>
        )}
        {disciplines && disciplines.length > 0 && (
          <DisciplineTable
            disciplines={disciplines}
            canWrite={canWrite}
            canDelete={canDelete}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}
        <div className="ev-cat-dlist__foot">
          <span>Kullanan = bu disipline bağlı iş tipi · bütçesinde BOQ grubu bu disipline eşlenmiş şantiye</span>
          <span>{canWrite ? "Sil yalnız kullanılmayan disiplinde açıktır" : "Değişiklik için tam yetki gerekir"}</span>
        </div>
      </div>
    </>
  );
}

interface DisciplineTableProps {
  disciplines: readonly EvDisciplineRead[];
  canWrite: boolean;
  canDelete: boolean;
  onEdit: (discipline: EvDisciplineRead) => void;
  onDelete: (discipline: EvDisciplineRead) => void;
}

function DisciplineTable({ disciplines, canWrite, canDelete, onEdit, onDelete }: DisciplineTableProps) {
  return (
    <div className="ev-cat-dlist">
      <table>
        <colgroup>
          <col className="ev-cat-dlist__col-code" />
          <col />
          <col className="ev-cat-dlist__col-own" />
          <col className="ev-cat-dlist__col-used" />
          <col className="ev-cat-dlist__col-act" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Renk · kod</th>
            <th scope="col">Ad</th>
            <th scope="col">Vars. Kendi/Taş.</th>
            <th scope="col" className="ev-cat-num">
              Kullanan
            </th>
            <th scope="col">{canWrite ? "Eylem" : ""}</th>
          </tr>
        </thead>
        <tbody>
          {disciplines.map((discipline) => {
            const itemCount = discipline.used_by_item_count;
            const siteCount = discipline.used_by_site_count;
            // B1-9: iş tipi YA DA şantiye bütçesi kullanıyorsa silinemez (API sayıları).
            const isInUse = itemCount > 0 || siteCount > 0;
            return (
              <tr key={discipline.id}>
                <td>
                  <span className="ev-cat-dlist__code">
                    <DisciplineSwatch color={discipline.color} />
                    {discipline.code}
                  </span>
                </td>
                <td className="ev-cat-dlist__name">{discipline.name}</td>
                <td>
                  <ContractorBadge type={discipline.default_contractor_type} />
                </td>
                <td>
                  <span className="ev-cat-dlist__used">
                    <span className={cx("ev-cat-dlist__used-main", !isInUse && "ev-cat-dlist__used-main--zero")}>
                      {`${itemCount} iş tipi`}
                    </span>
                    <span className="ev-cat-dlist__used-sub">{`${siteCount} şantiye`}</span>
                  </span>
                </td>
                <td>
                  {canWrite && (
                    <span className="ev-cat-dlist__acts">
                      <span className="ev-cat-dlist__btns">
                        <button type="button" className="ev-cat-link ev-cat-link--edit" onClick={() => onEdit(discipline)}>
                          Düzenle
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className="ev-cat-link ev-cat-link--delete"
                            disabled={isInUse}
                            onClick={() => onDelete(discipline)}
                          >
                            Sil
                          </button>
                        )}
                      </span>
                      {canDelete && isInUse && <span className="ev-cat-dlist__reason">Kullanımda · silinemez</span>}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
