import { DateInput, Field, Input, Select } from "@/components/ui";
import { durationDays } from "@/lib/form/derive";
import { formatCurrency, formatDateDots } from "@/lib/format";
import type { SectionDetailResponse } from "@/lib/api/hooks/useSection";
import type { SectionMilestone } from "./build-body";
import type { SectionFormValues } from "./form-state";
import type { SectionFormErrors } from "./validate";

/** Bağımlılık seçicisinin seçenekleri — aynı şantiyenin öbür bölümleri. */
export interface DependencyOption {
  id: string;
  name: string;
}

export interface ScheduleBudgetCardProps {
  values: SectionFormValues;
  onChange: <K extends keyof SectionFormValues>(field: K, value: SectionFormValues[K]) => void;
  errors?: SectionFormErrors;
  /** Aynı şantiyedeki öbür bölümler (kendisi HARİÇ). */
  dependencyOptions: readonly DependencyOption[];
  /** Düzenleme kipinde kayıtlı milestone'lar — ipucu metni bunlardan TÜRER. */
  existingMilestones: readonly SectionMilestone[];
  /** Yeni bölüm (create): henüz tahsis yok → bedel boş, gerekçe "atanınca hesaplanır". */
  isNew: boolean;
  /** Düzenlemede detaydaki türev `budget` (BOQ tahsislerinden); yeni bölümde yok. */
  derivedBudget?: SectionDetailResponse["budget"];
}

const DERIVED_EMPTY = "—";
const BUDGET_HINT_EXISTING = "İş kalemlerinden hesaplanır";
const BUDGET_HINT_NEW = "İş kalemi atanınca hesaplanır";

/**
 * Bölüm Bedeli kutusunun gösterim metni. `available` TEK BAŞINA yetmez (bayrak
 * VE değer — SectionCard ile aynı kural). K-MKD3: tahsisi olmayan bölüm
 * `available: true` + "0.00" döner ve bu GERÇEK sıfırdır ("₺ 0"), yer tutucu
 * ("—") DEĞİL.
 */
function derivedBudgetText(isNew: boolean, budget: ScheduleBudgetCardProps["derivedBudget"]): string {
  if (isNew || !budget) return "";
  const isReal = budget.available && budget.value !== null && budget.value !== undefined;
  return isReal ? formatCurrency(budget.value) : DERIVED_EMPTY;
}

/**
 * 📅 Takvim & Bütçe kartı (mockup F104–128).
 *
 * 🔴 F-TKV T5 — GANTT KİLİDİ BURADA AÇILDI. Bağımlılık (F115-118) ve Milestone
 * (F119-123) kontrolleri P11 uçları yokken `disabled` basılıyordu; uçlar
 * açıldı (`SectionCreate`/`SectionUpdate` → `depends_on_section_id`,
 * `milestones`) ve `/projeler/takvim` ekranı elmasları ÇİZİYOR. Kilit açılmasa
 * ekran "milestone çizen ama hiçbir zaman milestone göremeyen" bir yüzey
 * olurdu.
 *
 * MİLESTONE SATIRI = EKLEME KUTUSU: mockup TEK satır çizer, etiketi
 * "Milestone Ekle"dir ve silme/liste yüzeyi HİÇ çizmemiştir. Bu yüzden form
 * `milestones: []` (hepsini sil) gövdesini ASLA üretmez; kutu boşken anahtar
 * hiç gönderilmez ve kayıtlı satırlar korunur. Kaç satır korunduğu ipucunda
 * GÖRÜNÜR — sayı öğenin kendi verisinden türer, elle yazılmaz.
 */
export function ScheduleBudgetCard({
  values,
  onChange,
  errors,
  dependencyOptions,
  existingMilestones,
  isNew,
  derivedBudget,
}: ScheduleBudgetCardProps) {
  // Türev alan — gövdede GÖNDERİLMEZ (F109).
  const duration = durationDays(values.startDate, values.endDate);
  const milestoneHint =
    existingMilestones.length === 0
      ? "Takvimde elmas işaret olarak görünür"
      : `Takvimde elmas işaret olarak görünür · kayıtlı ${existingMilestones.length} milestone korunur (${existingMilestones
          .map((milestone) => `${milestone.title} — ${formatDateDots(milestone.milestone_date)}`)
          .join(" · ")})`;

  return (
    <section className="pf-card">
      <h2 className="pf-card__title">📅 Takvim &amp; Bütçe</h2>
      <div className="pf-grid pf-grid--4">
        <Field label="Başlangıç Tarihi" required error={errors?.startDate}>
          {(control) => (
            <DateInput
              {...control}
              value={values.startDate}
              status={errors?.startDate ? "error" : "default"}
              onValueChange={(iso) => onChange("startDate", iso)}
            />
          )}
        </Field>

        <Field label="Planlanan Bitiş" required error={errors?.endDate}>
          {(control) => (
            <DateInput
              {...control}
              value={values.endDate}
              status={errors?.endDate ? "error" : "default"}
              onValueChange={(iso) => onChange("endDate", iso)}
            />
          )}
        </Field>

        <Field label="Süre (Gün)" hint="Otomatik hesaplanır">
          {(control) => (
            <Input {...control} readOnly numeric value={duration === null ? "" : String(duration)} placeholder="181" />
          )}
        </Field>

        {/* BLF-F1.3 (F-a): Bölüm Bedeli YALNIZ HESAPLANIR — Σ(bölüm payı × birim
            fiyat). Kilitli (disabled) kutu + gerekçe; elle giriş ve zorunluluk
            yıldızı YOK, gövdeye `budget_amount` girmez. Kullanıcı onaylı
            sapma: mockup bu kutuyu elle girilen zorunlu alan çizer. */}
        <Field label="Bölüm Bedeli" hint={isNew ? BUDGET_HINT_NEW : BUDGET_HINT_EXISTING}>
          {(control) => (
            <Input {...control} disabled numeric value={derivedBudgetText(isNew, derivedBudget)} />
          )}
        </Field>
      </div>

      <div className="sf-divider" />

      <div className="pf-grid pf-grid--2">
        <Field
          label="Bağımlılık (Önce Bitmesi Gereken Bölüm)"
          hint="Gantt'ta bağlantı çizgisi olarak görünür"
          error={errors?.dependsOnSectionId}
        >
          {(control) => (
            <Select
              {...control}
              value={values.dependsOnSectionId}
              status={errors?.dependsOnSectionId ? "error" : "default"}
              onChange={(e) => onChange("dependsOnSectionId", e.target.value)}
            >
              <option value="">— Bağımsız başlar</option>
              {dependencyOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Milestone Ekle" hint={milestoneHint} error={errors?.milestoneTitle}>
          {(control) => (
            <div className="sf-milestone-row">
              <Input
                {...control}
                value={values.milestoneTitle}
                status={errors?.milestoneTitle ? "error" : "default"}
                onChange={(e) => onChange("milestoneTitle", e.target.value)}
                placeholder="Kat 14 döşeme tamamlanması"
                className="sf-milestone-row__text"
              />
              <DateInput
                aria-label="Milestone tarihi"
                value={values.milestoneDate}
                status={errors?.milestoneTitle ? "error" : "default"}
                onValueChange={(iso) => onChange("milestoneDate", iso)}
                className="sf-milestone-row__date"
              />
            </div>
          )}
        </Field>
      </div>
    </section>
  );
}
