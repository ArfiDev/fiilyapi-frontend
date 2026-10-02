import type { OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";
import type { WorkItemRead } from "@/lib/api/models";
import { Button } from "@/components/ui";

import { TemplateGroupRow } from "./TemplateGroupRow";
import { groupKey, groupRefsOf, type GroupRef } from "./template-content";
import { catalogPriceCell, formatAsPerUnit, groupCode } from "./template-model";
import "./offer-templates.css";

const REMOVE_ITEM_TITLE = "Kalemi çıkar";

interface TemplateItemsTableProps {
  detail: OfferTemplateDetail;
  /** `catalog_item_id` → katalog kalemi (tek `useCatalogItems` listesinden; ayrı istek yok). */
  catalog: ReadonlyMap<string, WorkItemRead>;
  canEdit: boolean;
  onAddGroup: () => void;
  /** "+ Katalogdan Ekle": seçiciyi açar (F4.6). */
  onAddFromCatalog: () => void;
  /** Grup (ad, aynı adlılar arasındaki sıra) çiftiyle anılır: ad tek başına aynı adlı grupta yanlış gruba giderdi. */
  onRenameGroup: (group: GroupRef, newName: string) => void;
  onRemoveGroup: (group: GroupRef) => void;
  onRemoveItem: (group: GroupRef, catalogItemId: string) => void;
}

/** TS:130-159 — "Kalemler" kartı: üst şerit + Poz No · Tarif · Birim · Katalog son fiyat · A-s / birim · × tablosu. */
export function TemplateItemsTable({ detail, catalog, canEdit, onAddGroup, onAddFromCatalog, onRenameGroup, onRemoveGroup, onRemoveItem }: TemplateItemsTableProps) {
  const refs = groupRefsOf(detail.groups);
  return (
    <section className="otpl-items" aria-label="Şablon kalemleri">
      <div className="otpl-items__head">
        <h2 className="otpl-items__title">Kalemler</h2>
        <span className="otpl-items__count">
          {detail.item_count} kalem · {detail.group_count} grup
        </span>
        {canEdit && (
          <div className="otpl-items__actions">
            <Button variant="secondary" size="sm" onClick={onAddGroup}>
              + Grup
            </Button>
            <Button variant="secondary" size="sm" onClick={onAddFromCatalog}>
              + Katalogdan Ekle
            </Button>
          </div>
        )}
      </div>
      <div className="otpl-table-wrap">
        <table className="otpl-table">
          <colgroup>
            <col style={{ width: 110 }} />
            <col />
            <col style={{ width: 70 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Poz No</th>
              <th scope="col">Tarif</th>
              <th scope="col">Birim</th>
              <th scope="col" className="otpl-col--num">
                Katalog son fiyat
              </th>
              <th scope="col" className="otpl-col--num">
                A-s / birim
              </th>
              <th scope="col">
                <span className="sr-only">İşlem</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.groups.map((group, index) => (
              <GroupBlock
                // Backend kimliği her PUT'ta değişir: satır yeniden kurulup yazılan grup adı kaybolmasın (TKL-F4.6b O4).
                key={groupKey(group.name, refs[index]?.nth ?? 0)}
                groupRef={refs[index] ?? { name: group.name, nth: 0 }}
                code={groupCode(index)}
                group={group}
                catalog={catalog}
                canEdit={canEdit}
                onRenameGroup={onRenameGroup}
                onRemoveGroup={onRemoveGroup}
                onRemoveItem={onRemoveItem}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type GroupBlockProps = Pick<TemplateItemsTableProps, "catalog" | "canEdit" | "onRenameGroup" | "onRemoveGroup" | "onRemoveItem"> & {
  groupRef: GroupRef;
  code: string;
  group: OfferTemplateDetail["groups"][number];
};

function GroupBlock({ groupRef, code, group, catalog, canEdit, onRenameGroup, onRemoveGroup, onRemoveItem }: GroupBlockProps) {
  return (
    <>
      <TemplateGroupRow
        code={code}
        name={group.name}
        itemCount={group.items.length}
        canEdit={canEdit}
        onRename={(next) => onRenameGroup(groupRef, next)}
        onRemove={() => onRemoveGroup(groupRef)}
      />
      {group.items.map((item) => {
        const catalogItem = catalog.get(item.catalog_item_id);
        const price = catalogPriceCell(catalogItem);
        return (
          <tr key={item.id}>
            <td className="otpl-cell--mono">{item.poz_no}</td>
            <td>{item.description}</td>
            <td className="otpl-cell--unit">{item.unit}</td>
            <td className={price.kind === "price" ? "otpl-cell--price" : "otpl-cell--price otpl-cell--ref"}>{price.text}</td>
            <td className="otpl-cell--as">{formatAsPerUnit(catalogItem)}</td>
            <td className="otpl-cell--action">
              {canEdit && (
                <button
                  type="button"
                  className="otpl-x"
                  title={REMOVE_ITEM_TITLE}
                  aria-label={`${REMOVE_ITEM_TITLE}: ${item.poz_no}`}
                  onClick={() => onRemoveItem(groupRef, item.catalog_item_id)}
                >
                  ×
                </button>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
