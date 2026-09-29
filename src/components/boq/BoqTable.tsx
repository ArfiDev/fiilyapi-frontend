import { Fragment } from "react";

import { Button } from "@/components/ui/button/Button";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { formatAmount, formatQuantity } from "@/lib/format";
import type { BoqGroup, BoqItem, BoqTotals } from "@/lib/api/hooks/useBoq";

import { BoqPctCell } from "./BoqPctCell";

import "./boq.css";

export interface BoqTableProps {
  /** Gruplar yükten geldiği sırada basılır — frontend yeniden sıralamaz. */
  groups: BoqGroup[];
  /** GENEL TOPLAM satırının kaynağı (mockup 174–177). */
  totals: BoqTotals;
  /**
   * Yazma yüzeyleri kapısı (spec §2.5). Varsayılan `true` — seviye bilinmiyorsa
   * buton görünür kalır (bilinmezlik kuralı §2.5.3).
   */
  canWrite?: boolean;
  /** Boş durumdaki "+ İş Kalemi" eylemi (spec §9). */
  onCreate?: () => void;
  /** Satır tetikleyicisi — düzenleme kipini açar (spec §7.2). */
  onEditItem?: (item: BoqItem, groupId: string) => void;
}

const COLUMN_COUNT = 7;

// Poz tablosu (mockup 92–171). Mockup'in 7 sutunlu duzeni korunur: eylem
// sutunu / kebap menusu / 8. sutun EKLENMEZ (spec §7 karar 4).
export function BoqTable({
  groups,
  totals,
  canWrite = true,
  onCreate,
  onEditItem,
}: BoqTableProps) {
  // Duzenleme yalniz yazma yetkisi VE bir tetikleyici varken baglanir; aksi
  // halde "gorunup calismayan" odaklanabilir oge birakilmaz (spec §7.2).
  const isRowEditable = canWrite && Boolean(onEditItem);
  // Disiplini atanmış kullanıcıda backend süzmesi listeyi boşaltabilir (DSC-F1.3).
  const scope = useDisciplineScope();
  return (
    <div className="boq-table-card">
      <table className="boq-table">
        <caption className="sr-only">İş kalemleri listesi</caption>
        <thead>
          <tr className="boq-table__head-row">
            <th scope="col" className="boq-table__th boq-table__col--code">
              Poz No
            </th>
            <th scope="col" className="boq-table__th boq-table__col--desc">
              İş Kalemi Tarifi
            </th>
            <th scope="col" className="boq-table__th boq-table__col--unit">
              Birim
            </th>
            <th scope="col" className="boq-table__th boq-table__col--quantity">
              Miktar
            </th>
            <th scope="col" className="boq-table__th boq-table__col--price">
              Birim Fiyat
            </th>
            <th scope="col" className="boq-table__th boq-table__col--amount">
              Tutar
            </th>
            <th scope="col" className="boq-table__th boq-table__col--pct">
              Gerç. %
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr>
              <td className="boq-table__empty" colSpan={COLUMN_COUNT} data-testid="boq-empty">
                {scope.isRestricted ? (
                  <RestrictedEmptyNotice names={scope.names} />
                ) : (
                  <p className="boq-table__empty-text">Bu şantiyede henüz iş kalemi tanımlanmadı.</p>
                )}
                {/* Davranis F8'de baglanir; bu task'ta baslik seridindeki
                    ikizi gibi islevsizdir. Ikizi gibi ayni izin kapisina da
                    baglidir (spec §2.5): salt-okunur kullaniciya calismayan
                    yazma yuzeyi birakilmaz. */}
                {canWrite && (
                  <Button
                    variant="primary"
                    className="boq-action boq-action--primary"
                    onClick={onCreate}
                  >
                    + İş Kalemi
                  </Button>
                )}
              </td>
            </tr>
          ) : (
            groups.map((group, index) => (
              <Fragment key={group.id}>
                <tr className="boq-table__group-row">
                  {/* Numara DIZINDEN turetilir, `sort_order`in ham degerinden
                      degil (spec §5.2): sort_order seyrek olabilir (10/20/30),
                      mockup 1-2-3 kesintisiz sayar. Buyuk harf CSS ile. */}
                  <th
                    scope="colgroup"
                    colSpan={COLUMN_COUNT}
                    className="boq-table__group"
                    data-testid="boq-group"
                  >
                    {`${index + 1}. ${group.name}`}
                  </th>
                </tr>
                {/* `group_total` backend'de var ama mockup'ta grup alt-toplam
                    satiri YOK → basilmaz (spec §5.3). */}
                {group.items.map((item) => {
                  return (
                    <tr
                      key={item.id}
                      className={
                        isRowEditable
                          ? "boq-table__row boq-table__row--editable"
                          : "boq-table__row"
                      }
                      // Spec §7.2: POZ SATIRININ TAMAMI tiklanabilir. Kapi burada
                      // olmali — hover/cursor tum satira uygulandigi icin yalniz
                      // Poz No hucresini baglamak, satirin geri kalaninda sessizce
                      // calismayan bir tiklama vaadi birakir (kod inceleme bulgusu).
                      // Ic butonun tiklamasi da buraya kabarcigi ile gelir: tek
                      // cagri, cift tetikleme yok.
                      onClick={isRowEditable ? () => onEditItem?.(item, group.id) : undefined}
                    >
                      {/* Klavye yolu Poz No hucresindeki GERCEK <button>'dir;
                          <tr tabIndex role="button"> satir semantigini bozar
                          (spec §7.2). Gorunusu duz metindir; Enter/Space ile
                          uretilen tiklama satira kabarir. */}
                      <td className="boq-table__cell boq-table__cell--code boq-table__col--code">
                        {isRowEditable ? (
                          <button
                            type="button"
                            className="boq-table__row-trigger"
                            aria-label={`${item.code} — ${item.description} kalemini düzenle`}
                          >
                            {item.code}
                          </button>
                        ) : (
                          <span>{item.code}</span>
                        )}
                      </td>
                      <td className="boq-table__cell boq-table__col--desc">{item.description}</td>
                      <td className="boq-table__cell boq-table__cell--unit boq-table__col--unit">
                        {item.unit}
                      </td>
                      <td className="boq-table__cell boq-table__cell--num boq-table__col--quantity">
                        {formatQuantity(item.quantity)}
                      </td>
                      <td className="boq-table__cell boq-table__cell--num boq-table__col--price">
                        {formatAmount(item.unit_price)}
                      </td>
                      {/* `amount` backend turevidir; miktar × fiyat frontend'de
                          YENIDEN HESAPLANMAZ (spec §3.4 sonu). */}
                      <td className="boq-table__cell boq-table__cell--num boq-table__cell--amount boq-table__col--amount">
                        {formatAmount(item.amount)}
                      </td>
                      {/* ⚠️ Eski not "Gerç. % TAMAMEN yer tutucu" diyordu ve
                          BAYATLADI: satir yuzdesi ILR-1'de baglandi
                          (`boq/service.py:126`, kaynak GUNLUK). Mockup'in dort
                          RENKLI rozeti hâlâ basilmaz — esik renkleri P7'ye
                          bagli ve bu dilimin kapsami disinda; baglanan yalniz
                          SAYININ KENDISI. */}
                      <BoqPctCell
                        progress={item.progress_pct}
                        className="boq-table__pct"
                        data-testid="boq-pct"
                      />
                    </tr>
                  );
                })}
              </Fragment>
            ))
          )}
        </tbody>
        {/* GENEL TOPLAM (mockup 174–177). Bos BOQ'da bile basilir: backend
            `grand_total: "0.00"` doner (spec §5.5). Toplam frontend'de
            HESAPLANMAZ, backend degeri oldugu gibi bicimlenir. */}
        <tfoot>
          <tr className="boq-table__total-row" data-testid="boq-total-row">
            <th scope="row" colSpan={5} className="boq-table__total-label">
              GENEL TOPLAM
            </th>
            <td
              className="boq-table__total-amount boq-table__col--amount"
              data-testid="boq-total-amount"
            >
              {formatAmount(totals.grand_total)}
            </td>
            {/* Mockup 177 `%75`. ⚠️ Eski not "veri hakedis modulunu bekliyor"
                diyordu ve BAYATLADI — alan ILR-1'de baglandi; zarf dallanmasi
                `BoqPctCell`de, dort kopyayla tek kaynaktan. */}
            <BoqPctCell
              progress={totals.grand_progress_pct}
              className="boq-table__total-pct boq-table__col--pct"
              data-testid="boq-total-pct"
            />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
