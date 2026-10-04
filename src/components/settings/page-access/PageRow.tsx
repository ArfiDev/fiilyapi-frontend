import { Checkbox } from "@/components/ui";
import { cx } from "@/lib/cx";
import type { PageCatalogEntry } from "@/lib/api/hooks/usePages";
import type { PageGrant, PageLevel } from "@/lib/api/models";
import { PageLevelSegment } from "./PageLevelSegment";
import { LEVEL_LABELS } from "./page-access-labels";

interface PageRowProps {
  page: PageCatalogEntry;
  /** Taslaktaki hücre. */
  grant: PageGrant;
  /** Sunucudaki (kaydedilmiş) hücre; farklıysa satır "değişti" vurgusu alır. */
  saved: PageGrant | undefined;
  readOnly: boolean;
  onLevelChange: (key: string, level: PageLevel) => void;
  onApproveChange: (key: string, approve: boolean) => void;
}

/** Satır etiketleri: düzey değiştiyse "önce: X"; yalnız onay değiştiyse onay etiketi. Görmez'e geçişte onayın kalktığı da görünür. */
function changeTags(grant: PageGrant, saved: PageGrant | undefined): string[] {
  if (!saved) return [];
  const tags: string[] = [];
  if (saved.level !== grant.level) tags.push(`önce: ${LEVEL_LABELS[saved.level]}`);
  if (saved.approve !== grant.approve) tags.push(grant.approve ? "Onaylar işaretlendi" : "Onaylar kaldırıldı");
  return tags;
}

export function PageRow({ page, grant, saved, readOnly, onLevelChange, onApproveChange }: PageRowProps) {
  const tags = changeTags(grant, saved);
  const isChanged = tags.length > 0;
  const approveOff = grant.level === "none";
  return (
    <li className={cx("page-row", isChanged && "page-row--changed")} data-page-key={page.key}>
      <div className="page-row__name-cell">
        <div className="page-row__name">
          {page.name}
          {tags.map((tag) => (
            <span key={tag} className="page-row__tag">
              {tag}
            </span>
          ))}
        </div>
        <div className="page-row__route">{page.route}</div>
      </div>
      <div>
        <PageLevelSegment
          value={grant.level}
          disabled={readOnly}
          aria-label={`${page.name} erişim düzeyi`}
          onChange={(level) => onLevelChange(page.key, level)}
        />
      </div>
      <div className={cx("page-row__approve", approveOff && "page-row__approve--off")}>
        {page.has_approval && (
          <Checkbox
            label="Onaylar"
            aria-label={`${page.name} · Onaylar`}
            checked={grant.approve}
            disabled={readOnly || approveOff}
            onChange={(event) => onApproveChange(page.key, event.target.checked)}
          />
        )}
      </div>
    </li>
  );
}
