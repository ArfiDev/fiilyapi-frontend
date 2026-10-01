import { Button } from "@/components/ui/button/Button";
import { Input } from "@/components/ui/input/Input";
import { CheckIcon, WarningTriangleIcon, inlineSymbolProps } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import { formatAmount, formatQuantity } from "@/lib/format";
import type {
  ContractDistributionGroup,
  ContractDistributionItem,
  ContractDistributionSite,
} from "@/lib/api/hooks/useContract";
import { distributionCellKey } from "@/lib/contract-distribution-save";
import { remainingQuantity } from "@/lib/distribute-remaining";

import {
  allocationQuantityFor,
  distributionCellDisplayValue,
  distributionSiteAccent,
  isRemainingSettled,
  isUndistributedItem,
  toDistributeRemainingItem,
} from "./distribution-derive";
import "./employer-contract-detail.css";
import "./contract-distribution.css";

/**
 * POZ 69-165 · "Poz Listesi & Şantiye Dağılımı" tablosu.
 *
 * ⚠️ Tablo kabuğu/ölçüleri `.ecd-items__*` sınıflarından gelir — o sınıflar
 * T3'te ZATEN bu mockup'tan (69-135) çıkarılmıştı, burada YENİDEN TÜRETİLMEZ.
 * Bu bileşenin eklediği tek şey mockup'ın E14'te karşılığı olmayan parçaları:
 * dinamik şantiye kota kolonları (82-83), düzenlenebilir hücreler (98-99),
 * dağıtılmamış kalem satırı (153-155) ve kırmızı Kalan rozeti (161).
 *
 * **ŞANTİYE KOLONLARI DİNAMİKTİR.** Mockup iki blok çizer ama kolon kümesi
 * yanıtın `sites` dizisidir; iki varsayılmaz.
 *
 * Hücre girdisi `type="number"` DEĞİLDİR: T1'in çözümleyicisi Türkçe klavyenin
 * virgülünü kabul eder (`1,5` → `1.5`), `type="number"` ise virgülü tarayıcıya
 * göre sessizce yutardı. `inputMode="decimal"` mobil klavyeyi yine sayısal açar.
 */
export interface ContractDistributionGridProps {
  sites: readonly ContractDistributionSite[];
  groups: readonly ContractDistributionGroup[];
  /** Kirli hücrelerin HAM metni — anahtar `distributionCellKey`. */
  edits: ReadonlyMap<string, string>;
  canWrite: boolean;
  onCellChange: (contractItemId: string, siteId: string, value: string) => void;
  /** KDG K7 · kolon başlığındaki "Kalanı buraya dağıt". */
  onDistributeRemaining: (siteId: string) => void;
  /** İzin yok / metraj gizli — gerekçe ekranda görünür (üst bileşen yazar). */
  isDistributeDisabled: boolean;
}

export function ContractDistributionGrid({
  sites,
  groups,
  edits,
  canWrite,
  onCellChange,
  onDistributeRemaining,
  isDistributeDisabled,
}: ContractDistributionGridProps) {
  // 5 sabit kolon (77-81) + şantiye başına 1 (82-83) + Kalan (84).
  const columnCount = 6 + sites.length;

  return (
    <section className="ecd-items" aria-labelledby="cdist-grid-title">
      {/* 70-72 */}
      <div className="ecd-items__head">
        <span className="ecd-items__head-title" id="cdist-grid-title">
          Poz Listesi &amp; Şantiye Dağılımı
        </span>
        {/* 72 — YUMUŞAK kural metni: hard validation YOKTUR, aşımı backend
            reddeder (422) ve mesajı ekranda basılır. */}
        <span className="cdist-grid__rule">
          Sözleşme miktarı = tüm şantiye kotaları toplamı olmalı
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="ecd-empty">Bu sözleşmede henüz iş kalemi yok</p>
      ) : (
        <div className="ecd-items__scroll">
          <table className="ecd-items__table">
            <thead>
              <tr>
                <th className="ecd-items__th ecd-items__th--lead">Poz No</th>
                <th className="ecd-items__th ecd-items__th--lead">Poz Adı</th>
                <th className="ecd-items__th ecd-items__th--center">Birim</th>
                <th className="ecd-items__th ecd-items__th--right">Sözl. Birim F.</th>
                <th className="ecd-items__th ecd-items__th--right">Toplam Miktar</th>
                {sites.map((site, index) => (
                  // 82-83: "🏗 A-Blok Kota" — şantiye adı VERİDEN gelir.
                  <th
                    key={site.id}
                    className={cx(
                      "ecd-items__th",
                      "ecd-items__th--right",
                      "cdist-grid__th-site",
                      `cdist-accent-${distributionSiteAccent(index)}`,
                    )}
                    data-testid="cdist-site-column"
                  >
                    🏗 {site.name} Kota
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cdist-grid__distribute"
                      disabled={isDistributeDisabled}
                      onClick={() => onDistributeRemaining(site.id)}
                      data-testid="cdist-distribute-remaining"
                    >
                      Kalanı buraya dağıt
                    </Button>
                  </th>
                ))}
                <th className="ecd-items__th ecd-items__th--center">Kalan</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <GroupRows
                  key={group.id}
                  group={group}
                  sites={sites}
                  edits={edits}
                  canWrite={canWrite}
                  columnCount={columnCount}
                  onCellChange={onCellChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface GroupRowsProps
  extends Omit<
    ContractDistributionGridProps,
    "groups" | "onDistributeRemaining" | "isDistributeDisabled"
  > {
  group: ContractDistributionGroup;
  columnCount: number;
}

function GroupRows({
  group,
  sites,
  edits,
  canWrite,
  columnCount,
  onCellChange,
}: GroupRowsProps) {
  return (
    <>
      {/* 89-90 */}
      <tr className="ecd-items__group-row">
        <td className="ecd-items__group-cell" colSpan={columnCount}>
          {group.name}
        </td>
      </tr>
      {group.items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          sites={sites}
          edits={edits}
          canWrite={canWrite}
          onCellChange={onCellChange}
        />
      ))}
    </>
  );
}

interface ItemRowProps
  extends Omit<
    ContractDistributionGridProps,
    "groups" | "onDistributeRemaining" | "isDistributeDisabled"
  > {
  item: ContractDistributionItem;
}

function ItemRow({ item, sites, edits, canWrite, onCellChange }: ItemRowProps) {
  const isUndistributed = isUndistributedItem(item);
  const hasDirtyCell = sites.some((site) => edits.has(distributionCellKey(item.id, site.id)));
  const shownRemaining = liveRemaining(item, sites, edits, hasDirtyCell);
  const isSettled = isRemainingSettled(shownRemaining);

  return (
    <tr
      className={cx(
        "ecd-items__row",
        isUndistributed && "cdist-grid__row--undistributed", // 153
      )}
      data-testid={isUndistributed ? "cdist-undistributed-row" : undefined}
    >
      <td className="ecd-items__td ecd-items__td--code">{item.code}</td>
      <td className="ecd-items__td ecd-items__td--name">
        {item.description}
        {isUndistributed && (
          // 155 — `⚠` inline SVG'dir (F-SEM); metin AYNEN kalır.
          <span className="cdist-grid__row-warning" data-testid="cdist-undistributed-note">
            <WarningTriangleIcon {...inlineSymbolProps} /> Henüz şantiyeye atanmadı
          </span>
        )}
      </td>
      <td className="ecd-items__td ecd-items__td--center">{item.unit}</td>
      <td className="ecd-items__td ecd-items__td--price">{formatAmount(item.unit_price)}</td>
      <td className="ecd-items__td ecd-items__td--qty">{formatQuantity(item.quantity)}</td>

      {sites.map((site, index) => {
        const key = distributionCellKey(item.id, site.id);
        const edit = edits.get(key);
        const value = edit ?? distributionCellDisplayValue(allocationQuantityFor(item, site.id));
        return (
          <td
            key={site.id}
            className={cx(
              "ecd-items__td",
              "cdist-cell",
              `cdist-accent-${distributionSiteAccent(index)}`,
              value.length === 0 && "cdist-cell--empty", // 159-160
            )}
          >
            <Input
              size="row"
              inputMode="decimal"
              value={value}
              disabled={!canWrite}
              // Etiketsiz girdi yasak; başlık kolonu ekran okuyucuya bağlanmaz.
              aria-label={`${item.code} · ${site.name} kotası`}
              data-testid="cdist-cell-input"
              data-dirty={edit === undefined ? "false" : "true"}
              placeholder="—" // 159
              onChange={(event) => onCellChange(item.id, site.id, event.target.value)}
            />
          </td>
        );
      })}

      <td className="ecd-items__td ecd-items__td--center">
        {/* 100 (✓ 0, yeşil) vs 161 (kalan miktar, KIRMIZI). */}
        <span
          className={cx(
            "ecd-items__remaining",
            isSettled ? "ecd-items__remaining--zero" : "cdist-grid__remaining--open",
          )}
          data-testid="cdist-remaining"
          // `✓` artık inline SVG (F-SEM) ⇒ metinden ayırt edilemez; kapanmış
          // rozet YAPISAL olarak da damgalanır, testler bunu okur.
          data-settled={isSettled ? "true" : "false"}
          data-dirty={hasDirtyCell ? "true" : "false"}
        >
          {isSettled ? (
            <>
              <CheckIcon {...inlineSymbolProps} /> 0
            </>
          ) : (
            formatQuantity(shownRemaining)
          )}
        </span>
        {hasDirtyCell && shownRemaining !== null && (
          // KDG K7 · taslaktan hesaplanan rozet: kaydedilmediği GÖRÜNÜR yazılır.
          <span className="cdist-grid__unsaved" data-testid="cdist-remaining-unsaved">
            kaydedilmedi
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * KDG K7 · canlı Kalan: kirli hücre varsa quantity − Σ etkin değer; yoksa
 * sunucunun `remaining_quantity`si otoritedir. Maskeli metrajda (`null`) ya da
 * taslak geçersizken canlı hesap YAPILMAZ — sunucu değeri (maskede `null` → "—").
 */
function liveRemaining(
  item: ContractDistributionItem,
  sites: readonly ContractDistributionSite[],
  edits: ReadonlyMap<string, string>,
  hasDirtyCell: boolean,
): string | null {
  if (!hasDirtyCell || item.remaining_quantity === null) return item.remaining_quantity;
  const distributeItem = toDistributeRemainingItem(item);
  if (distributeItem === null) return item.remaining_quantity;
  const live = remainingQuantity(
    distributeItem,
    sites.map((site) => site.id),
    edits,
    distributionCellKey,
  );
  return live ?? item.remaining_quantity;
}
