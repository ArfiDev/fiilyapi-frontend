import { Field, Select } from "@/components/ui";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import type { ProjectListItem } from "@/lib/api/hooks/useProjects";
import type { UnitBlockGroup, UnitResponse } from "@/lib/api/hooks/useProjectUnits";

import { EMPTY_METRIC, SALE_TYPE_OPTIONS, UNIT_COST_PENDING_REASON } from "./constants";
import type { SaleFormValues } from "./form-state";
import type { SaleFormErrors } from "./validate";
import { deriveUnitInfoBoxes } from "./unit-info";

const PLACEHOLDER = "Seçiniz...";

/**
 * Üniteyi SATIŞA KAPATAN sunucu damgası — yoksa `null`. İstemci kural
 * UYDURMAZ, backend korkuluklarının okuduğu iki alanı okur:
 *   • `ensure_unit_sellable` → `owner_side='landowner'` ise 422
 *     (`is_landowner_share` bu karşılaştırmanın sunucudaki türevidir),
 *   • `ensure_no_open_sale` → ünitede açık satış kaydı varsa 409; ünitenin
 *     `sales_status`u (`reserved`/`sold`) o kaydın TÜREVİDİR (spec §3).
 * Seçenek SİLİNMEZ, devre dışı + gerekçeli basılır: kullanıcı aradığı daireyi
 * listede bulur ve neden seçemediğini okur.
 */
function unitBlockedReason(unit: UnitResponse): string | null {
  if (unit.is_landowner_share) return "Arsa sahibi payı";
  if (unit.sales_status === "sold") return "Satıldı";
  if (unit.sales_status === "reserved") return "Rezerve";
  return null;
}

interface SoldUnitCardProps {
  values: SaleFormValues;
  errors: SaleFormErrors;
  projects: readonly ProjectListItem[];
  blocks: readonly UnitBlockGroup[];
  /** Seçili ünite (bilgi kutuları için) — yoksa kutular "—". */
  selectedUnit: UnitResponse | null;
  projectsDisabled: boolean;
  unitsDisabled: boolean;
  unitsNotice: string | null;
  onChangeProject: (projectId: string) => void;
  onChangeField: <K extends keyof SaleFormValues>(field: K, value: SaleFormValues[K]) => void;
  /** Satış oluşturulduktan sonra ünite/proje/tip kilitlenir. */
  locked: boolean;
  lockReason: string;
}

/**
 * "Satılan Ünite" kartı (DS 51-64). Proje + Blok/Ünite + Satış Tipi seçicileri
 * ve mor bilgi şeridi (liste fiyatı / m² / **maliyet**).
 *
 * ⚠️ Proje seçici SY ile aynı ONAYLI TÜRETİMdir: uçların hepsi proje kapsamlıdır
 * (`/projects/{id}/units`, `/projects/{id}/sales`), seçim olmadan ünite listesi
 * çekilemez. Mockup tek proje bağlamında çizilidir; seçici köprü şarttır.
 *
 * ⚠️ Maliyet (62) P10'dan GERÇEK gelir (`unit_cost` zarfı); zarf `available:false`
 * ise "—" + gerekçe basılır, İSTEMCİ MALİYET UYDURMAZ.
 */
export function SoldUnitCard({
  values,
  errors,
  projects,
  blocks,
  selectedUnit,
  projectsDisabled,
  unitsDisabled,
  unitsNotice,
  onChangeProject,
  onChangeField,
  locked,
  lockReason,
}: SoldUnitCardProps) {
  const info = selectedUnit ? deriveUnitInfoBoxes(selectedUnit) : null;

  return (
    <section className="pf-card">
      <h2 className="pf-card__title">🏠 Satılan Ünite</h2>

      {unitsNotice && (
        <p className="sf-notice" data-testid="satis-form-unite-uyari">
          {unitsNotice}
        </p>
      )}

      <div className="pf-grid pf-grid--3">
        {/* 54 */}
        <Field label="Proje" required error={errors.projectId}>
          {(control) => (
            <Select
              {...control}
              data-testid="satis-form-proje"
              disabled={projectsDisabled || locked}
              title={locked ? lockReason : undefined}
              value={values.projectId}
              onChange={(event) => onChangeProject(event.target.value)}
            >
              <option value="">{PLACEHOLDER}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 55 — blok bazlı optgroup */}
        <Field label="Blok / Ünite" required error={errors.unitId}>
          {(control) => (
            <Select
              {...control}
              data-testid="satis-form-unite"
              disabled={unitsDisabled || locked || values.projectId === ""}
              title={locked ? lockReason : undefined}
              value={values.unitId}
              onChange={(event) => onChangeField("unitId", event.target.value)}
            >
              <option value="">{PLACEHOLDER}</option>
              {blocks.map((group) => (
                <optgroup key={group.block.id} label={group.block.name}>
                  {group.units.map((unit) => {
                    const blockedReason = unitBlockedReason(unit);
                    return (
                      <option key={unit.id} value={unit.id} disabled={blockedReason !== null}>
                        {unit.label}
                        {unit.layout ? ` (${unit.layout})` : ""}
                        {blockedReason ? ` — ${blockedReason}` : ""}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>

        {/* 56 */}
        <Field label="Satış Tipi">
          {(control) => (
            <Select
              {...control}
              data-testid="satis-form-tip"
              disabled={locked}
              title={locked ? lockReason : undefined}
              value={values.saleType}
              onChange={(event) =>
                onChangeField("saleType", event.target.value as SaleFormValues["saleType"])
              }
            >
              {SALE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {/* 58-63 — mor bilgi şeridi */}
      <div className="sf-unit-info" data-testid="satis-form-unite-bilgi">
        <UnitInfoBox label="Brüt / Net m²" value={info?.grossNet ?? null} />
        <UnitInfoBox
          label="Liste Fiyatı"
          value={info?.listPrice == null ? null : `₺${info.listPrice}`}
        />
        <UnitInfoBox
          label="m² Birim Fiyat"
          value={info?.pricePerM2 == null ? null : `₺${info.pricePerM2}`}
        />
        {/* 62 — maliyet gri; yoksa "—" + gerekçe */}
        <div>
          <div className="sf-unit-info__label">Maliyet</div>
          {info && info.cost.available && info.cost.text !== null ? (
            <div className="sf-unit-info__value sf-unit-info__value--muted" data-testid="satis-form-maliyet">
              ₺{info.cost.text}
            </div>
          ) : (
            <div
              className="sf-unit-info__value sf-unit-info__value--muted sf-unit-info__pending"
              data-testid="satis-form-maliyet"
              title={info?.cost.isRestricted ? HIDDEN_FIELD_HINT : UNIT_COST_PENDING_REASON}
            >
              {EMPTY_METRIC}
              {info?.cost.isRestricted && <HiddenMark />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function UnitInfoBox({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="sf-unit-info__label">{label}</div>
      <div className="sf-unit-info__value">{value ?? EMPTY_METRIC}</div>
    </div>
  );
}
