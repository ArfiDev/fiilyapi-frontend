import { Button } from "@/components/ui/button/Button";
import { Input } from "@/components/ui/input/Input";
import { CheckIcon, WarningTriangleIcon, inlineSymbolProps } from "@/components/ui/icons";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { cx } from "@/lib/cx";
import { formatAmount, formatQuantity } from "@/lib/format";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import type {
  SectionDistributionGroup,
  SectionDistributionItem,
  SectionDistributionSection,
} from "@/lib/api/hooks/useSectionDistribution";
import { sectionDistributionCellKey } from "@/lib/section-distribution-save";

import {
  distributionCellDisplayValue,
  distributionSiteAccent,
  isRemainingSettled,
} from "../contracts/distribution-derive";
import {
  allocationQuantityForSection,
  hasNoAllocation,
  liveUnallocated,
  sectionColumnTitle,
} from "./derive";
import "../contracts/employer-contract-detail.css";
import "../contracts/contract-distribution.css";
import "./section-distribution.css";

/**
 * BDG · "kalem x bölüm" tablosu. `ContractDistributionGrid`ın KOPYASIdır
 * (sözleşme dosyaları DEĞİŞMEZ): kabuk `.ecd-items__*`, bölüm kolonları/hücreler
 * `cdist-*`. Farklar: Poz No + Poz Adı YAPIŞKAN (`.bdg-grid`), kolon sayısı
 * 10+ olabilir (yatay kayar), taslak bölüm normal kolondur (rozet/ikon yok),
 * "Şantiye Kotası" kalemin `quantity`sidir, sondaki rozet "Atanmamış"tır.
 *
 * Hücre girdisi `type="number"` DEĞİL: Türkçe virgül (`1,5`) çözümleyiciden
 * geçer; `inputMode="decimal"` mobil klavyeyi sayısal açar.
 */
export interface SectionDistributionGridProps {
  sections: readonly SectionDistributionSection[];
  groups: readonly SectionDistributionGroup[];
  /** Kirli hücrelerin HAM metni — anahtar `sectionDistributionCellKey`. */
  edits: ReadonlyMap<string, string>;
  canWrite: boolean;
  onCellChange: (boqItemId: string, sectionId: string, value: string) => void;
  /** KDG K7 · kolon başlığındaki "Kalanı buraya dağıt". */
  onDistributeRemaining: (sectionId: string) => void;
  /** İzin yok / metraj gizli — gerekçe ekranda görünür (üst bileşen yazar). */
  isDistributeDisabled: boolean;
}

// 5 sabit kolon + bölüm başına 1 + Atanmamış.
const FIXED_COLUMN_COUNT = 6;

export function SectionDistributionGrid({
  sections,
  groups,
  edits,
  canWrite,
  onCellChange,
  onDistributeRemaining,
  isDistributeDisabled,
}: SectionDistributionGridProps) {
  const scope = useDisciplineScope();
  const columnCount = FIXED_COLUMN_COUNT + sections.length;
  const hasItems = groups.some((group) => group.items.length > 0);

  return (
    <section className="ecd-items" aria-labelledby="bdg-grid-title">
      <div className="ecd-items__head">
        <span className="ecd-items__head-title" id="bdg-grid-title">
          Poz Listesi &amp; Bölüm Dağılımı
        </span>
      </div>

      {!hasItems ? (
        <div className="ecd-empty" data-testid="bdg-empty">
          {scope.isRestricted ? (
            <RestrictedEmptyNotice names={scope.names} />
          ) : (
            <p>Bu şantiyede henüz iş kalemi tanımlanmadı.</p>
          )}
        </div>
      ) : (
        <div className="ecd-items__scroll bdg-scroll">
          <table className="ecd-items__table bdg-grid" data-testid="bdg-grid">
            <thead>
              <tr>
                <th className="ecd-items__th ecd-items__th--lead bdg-sticky-code">Poz No</th>
                <th className="ecd-items__th ecd-items__th--lead bdg-sticky-name">Poz Adı</th>
                <th className="ecd-items__th ecd-items__th--center">Birim</th>
                <th className="ecd-items__th ecd-items__th--right">Birim F.</th>
                <th className="ecd-items__th ecd-items__th--right">Şantiye Kotası</th>
                {sections.map((section, index) => (
                  <th
                    key={section.id}
                    className={cx(
                      "ecd-items__th",
                      "ecd-items__th--right",
                      "cdist-grid__th-site",
                      `cdist-accent-${distributionSiteAccent(index)}`,
                    )}
                    data-testid="bdg-section-column"
                  >
                    {sectionColumnTitle(section)}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cdist-grid__distribute"
                      disabled={isDistributeDisabled}
                      onClick={() => onDistributeRemaining(section.id)}
                      data-testid="bdg-distribute-remaining"
                    >
                      Kalanı buraya dağıt
                    </Button>
                  </th>
                ))}
                <th className="ecd-items__th ecd-items__th--center">Atanmamış</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <GroupRows
                  key={group.id}
                  group={group}
                  sections={sections}
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

interface GroupRowsProps {
  group: SectionDistributionGroup;
  sections: readonly SectionDistributionSection[];
  edits: ReadonlyMap<string, string>;
  canWrite: boolean;
  columnCount: number;
  onCellChange: SectionDistributionGridProps["onCellChange"];
}

function GroupRows({ group, sections, edits, canWrite, columnCount, onCellChange }: GroupRowsProps) {
  return (
    <>
      <tr className="ecd-items__group-row">
        {/* colSpan'li td yapışkan olamaz; etiket span'i yapışır. */}
        <td className="ecd-items__group-cell" colSpan={columnCount}>
          <span className="bdg-group-label">{group.name}</span>
        </td>
      </tr>
      {group.items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          sections={sections}
          edits={edits}
          canWrite={canWrite}
          onCellChange={onCellChange}
        />
      ))}
    </>
  );
}

interface ItemRowProps {
  item: SectionDistributionItem;
  sections: readonly SectionDistributionSection[];
  edits: ReadonlyMap<string, string>;
  canWrite: boolean;
  onCellChange: SectionDistributionGridProps["onCellChange"];
}

function ItemRow({ item, sections, edits, canWrite, onCellChange }: ItemRowProps) {
  const sectionIds = sections.map((section) => section.id);
  const isUnassigned = hasNoAllocation(item);
  const hasDirtyCell = sectionIds.some((id) => edits.has(sectionDistributionCellKey(item.id, id)));
  const shownUnallocated = liveUnallocated(item, sectionIds, edits);
  const isSettled = isRemainingSettled(shownUnallocated);

  return (
    <tr
      className={cx("ecd-items__row", isUnassigned && "cdist-grid__row--undistributed")}
      data-testid={isUnassigned ? "bdg-unassigned-row" : undefined}
    >
      <td className="ecd-items__td ecd-items__td--code bdg-sticky-cell bdg-sticky-code">
        {item.code}
      </td>
      <td className="ecd-items__td ecd-items__td--name bdg-sticky-cell bdg-sticky-name">
        {item.description}
        {isUnassigned && (
          <span className="cdist-grid__row-warning">
            <WarningTriangleIcon {...inlineSymbolProps} /> Henüz bölüme atanmadı
          </span>
        )}
      </td>
      <td className="ecd-items__td ecd-items__td--center">{item.unit}</td>
      <td className="ecd-items__td ecd-items__td--price">{formatAmount(item.unit_price)}</td>
      <td className="ecd-items__td ecd-items__td--qty">{formatQuantity(item.quantity)}</td>

      {sections.map((section, index) => {
        const key = sectionDistributionCellKey(item.id, section.id);
        const edit = edits.get(key);
        const value =
          edit ?? distributionCellDisplayValue(allocationQuantityForSection(item, section.id));
        return (
          <td
            key={section.id}
            className={cx(
              "ecd-items__td",
              "cdist-cell",
              `cdist-accent-${distributionSiteAccent(index)}`,
              value.length === 0 && "cdist-cell--empty",
            )}
          >
            <Input
              size="row"
              inputMode="decimal"
              value={value}
              disabled={!canWrite}
              aria-label={`${item.code} · ${section.name} payı`}
              data-testid="bdg-cell-input"
              data-dirty={edit === undefined ? "false" : "true"}
              placeholder="—"
              onChange={(event) => onCellChange(item.id, section.id, event.target.value)}
            />
          </td>
        );
      })}

      <td className="ecd-items__td ecd-items__td--center">
        {/* Atanmamış: KIRMIZI (K6), kapanmışsa ✓ 0; maskelide "—". */}
        <span
          className={cx(
            "ecd-items__remaining",
            isSettled ? "ecd-items__remaining--zero" : "cdist-grid__remaining--open",
          )}
          data-testid="bdg-remaining"
          data-settled={isSettled ? "true" : "false"}
          data-dirty={hasDirtyCell ? "true" : "false"}
        >
          {isSettled ? (
            <>
              <CheckIcon {...inlineSymbolProps} /> 0
            </>
          ) : (
            formatQuantity(shownUnallocated)
          )}
        </span>
        {hasDirtyCell && shownUnallocated !== null && (
          <span className="cdist-grid__unsaved" data-testid="bdg-remaining-unsaved">
            kaydedilmedi
          </span>
        )}
      </td>
    </tr>
  );
}
