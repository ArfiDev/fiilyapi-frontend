"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert, Badge, Button, Field, Input, Select } from "@/components/ui";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { backendErrorMessage } from "@/lib/api/error-message";
import { isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { useEquipmentRentalInvoice } from "@/lib/api/hooks/useEquipmentRentalInvoices";
import {
  useUpdateRentalInvoice,
  useUpdateRentalInvoiceLine,
} from "@/lib/api/hooks/useEquipmentRentalInvoiceMutations";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import { PERIOD_MONTHS, formatPeriod } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { RentalLinesTable } from "./RentalLinesTable";
import { RentalSiteDistributionCard } from "./RentalSiteDistributionCard";
import { RentalStatusActions } from "./RentalStatusActions";
import { isRentalEditable, RENTAL_WRITE_LEVEL } from "./rental-actions";
import type { RentalEditableField } from "./rental-derive";
import {
  RATE_PERIOD_LABEL,
  RENTAL_RELOAD_PENDING_REASON,
  RENTAL_STATUS_BADGE,
  RENTAL_UNASSIGNED_SITE_LABEL,
} from "./rental-labels";
import "./equipment-rental.css";
import { routes } from "@/lib/routes";

const EQUIPMENT_PERMISSION_MODULE = "equipment";
const SUPPLIER_OPTIONS_LIMIT = 200;
const PERIOD_YEAR_SPAN = 5;

export interface EquipmentRentalInvoiceDetailViewProps {
  invoiceId: string;
}

/**
 * `/makine/kira/[invoiceId]` — `Makine - Kira Hakedişi.dc.html` (M5) ekranı.
 *
 * Kart haritası (mockup satırlarıyla):
 *   A · bilgi kutusu            M5:35-43
 *   B · gelen fatura başlığı    M5:46-66
 *   C · hakediş bilgileri       M5:69-77
 *   D · ekipman kira listesi    M5:80-174   → `RentalLinesTable`
 *   E · proje maliyet dağılımı  M5:177-193  → `RentalSiteDistributionCard`
 *
 * 🔴 SOL SIDEBAR mockup'ta YOKTUR (M5 kendi kabuğunu çizmez) — kabuk canon'u
 * kazanır, ekran `(app)` düzeninin içine oturur.
 */
export function EquipmentRentalInvoiceDetailView({
  invoiceId,
}: EquipmentRentalInvoiceDetailViewProps) {
  const detailQuery = useEquipmentRentalInvoice(invoiceId);
  const { level: permissionLevel } = useModulePermission(EQUIPMENT_PERMISSION_MODULE);
  const canWrite = hasAtLeast(permissionLevel, RENTAL_WRITE_LEVEL);
  const suppliersQuery = useSuppliers({ limit: SUPPLIER_OPTIONS_LIMIT });
  const siteOptions = useSiteOptions();

  const updateInvoice = useUpdateRentalInvoice();
  const updateLine = useUpdateRentalInvoiceLine();
  const [error, setError] = useState<string | null>(null);

  const detail = detailQuery.data;
  const editable =
    detail !== undefined && isRentalEditable(detail.status) && canWrite;

  /*
   * 🔴 F-İK "touched" DERSİ: form taslağı sunucu değerinden TÜRER ama
   * kullanıcının dokunmadığı alan sunucudaki değeri EZMEZ. Taslak yalnız
   * sunucudan yeni bir fatura geldiğinde tazelenir; `PATCH` gövdesine de
   * yalnız GERÇEKTEN değişen alanlar konur (`exclude_unset` karşılığı —
   * gönderilmeyen alan ile `null` gönderilen alan sunucuda FARKLIDIR).
   */
  const [draft, setDraft] = useState<{
    supplierId: string;
    invoiceNo: string;
    invoiceAmount: string;
    periodYear: string;
    periodMonth: string;
    siteId: string;
    ratePeriod: string;
  } | null>(null);

  useEffect(() => {
    if (detail === undefined) return;
    setDraft({
      supplierId: detail.supplier_id,
      invoiceNo: detail.invoice_no ?? "",
      invoiceAmount: detail.invoice_amount ?? "",
      periodYear: String(detail.period_year),
      periodMonth: String(detail.period_month),
      siteId: detail.site_id ?? "",
      ratePeriod: detail.rate_period,
    });
  }, [detail]);

  // SEKME-F1.3b — hook erken dönüşlerden ÖNCE (Rules of Hooks); `detail`
  // GET'ten SONRA seed edilen `draft` her `detail` değişiminde efektle
  // yeniden hizalanır (yukarıda), bu yüzden dirty hesabı da AYNI 7 alanı
  // karşılaştırır — kayıt sonrası invalidation `detail`i tazeler, efekt
  // `draft`ı sunucuyla hizalar ve dirty kendiliğinden false'a döner.
  const isDirty =
    draft !== null &&
    detail !== undefined &&
    (draft.supplierId !== detail.supplier_id ||
      (draft.invoiceNo || null) !== detail.invoice_no ||
      (draft.invoiceAmount || null) !== detail.invoice_amount ||
      Number(draft.periodYear) !== detail.period_year ||
      Number(draft.periodMonth) !== detail.period_month ||
      (draft.siteId || null) !== detail.site_id ||
      draft.ratePeriod !== detail.rate_period);
  useUnsavedChanges(isDirty, "Kira hakedişi başlığı");

  if (isForbidden(detailQuery.error)) return <AccessDenied />;

  // 🔴 SIRA ÖNEMLİ — HATA DALI YÜKLEME DALINDAN ÖNCE gelir. Hata hâlinde
  // `isLoading` false'tur ama `detail` yine `undefined` ve `draft` yine
  // `null`dur; yükleme dalı önce gelseydi onu yutar ve ekran SONSUZA KADAR
  // "Yükleniyor…" basardı — kullanıcı hiçbir zaman hata görmezdi.
  if (detailQuery.isError) {
    return (
      <div className="makine-kira">
        <Alert variant="danger">Kira hakedişi yüklenemedi.</Alert>
      </div>
    );
  }

  if (detailQuery.isLoading || draft === null || detail === undefined) {
    return (
      <div className="makine-kira">
        <p className="makine-kira__muted">Yükleniyor…</p>
      </div>
    );
  }

  const badge = RENTAL_STATUS_BADGE[detail.status];
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: PERIOD_YEAR_SPAN },
    (_, index) => currentYear - index,
  );

  function handleSaveHeader() {
    if (draft === null || detail === undefined) return;
    setError(null);

    // Yalnız DEĞİŞEN alanlar gövdeye girer (dokunulmamış alan sunucudaki
    // değeri ezmez — `model_fields_set` korumasının istemci yüzü).
    const body: Record<string, unknown> = {};
    if (draft.supplierId !== detail.supplier_id)
      body.supplier_id = draft.supplierId;
    if ((draft.invoiceNo || null) !== detail.invoice_no)
      body.invoice_no = draft.invoiceNo || null;
    if ((draft.invoiceAmount || null) !== detail.invoice_amount)
      body.invoice_amount = draft.invoiceAmount || null;
    if (Number(draft.periodYear) !== detail.period_year)
      body.period_year = Number(draft.periodYear);
    if (Number(draft.periodMonth) !== detail.period_month)
      body.period_month = Number(draft.periodMonth);
    if ((draft.siteId || null) !== detail.site_id)
      body.site_id = draft.siteId || null;
    if (draft.ratePeriod !== detail.rate_period)
      body.rate_period = draft.ratePeriod;

    if (Object.keys(body).length === 0) return;

    updateInvoice.mutate(
      { invoiceId: detail.id, body },
      {
        onError: (err) =>
          setError(
            backendErrorMessage(err, "Hakediş bilgileri kaydedilemedi."),
          ),
      },
    );
  }

  function handleSaveLine(
    lineId: string,
    field: RentalEditableField,
    value: string | null,
  ) {
    if (detail === undefined) return;
    setError(null);
    // Yanıt SATIRDIR, fatura değil — toplamlar/varyans yalnız faturanın
    // yeniden çekilmesiyle tazelenir, bu yüzden `invoiceId` de geçilir.
    updateLine.mutate(
      { invoiceId: detail.id, lineId, body: { [field]: value } },
      {
        onError: (err) =>
          setError(backendErrorMessage(err, "Satır kaydedilemedi.")),
      },
    );
  }

  return (
    <div className="makine-kira makine-kira--detail">
      {/* M5:18-24 — breadcrumb. */}
      <nav className="makine-kira__crumbs" aria-label="Konum">
        <Link href={routes.equipment.list()}>Makine &amp; Ekipman</Link>
        <span aria-hidden="true">/</span>
        <Link href={routes.equipment.rentalInvoices()}>Kira Hakedişi</Link>
        <span aria-hidden="true">/</span>
        <span className="makine-kira__crumb-current">
          {formatPeriod(detail.period_year, detail.period_month)}
        </span>
      </nav>

      <div className="makine-kira__title-row">
        <h1 className="makine-kira__title">
          Kira Hakedişi {"—"}{" "}
          {formatPeriod(detail.period_year, detail.period_month)}
        </h1>
        <RentalStatusActions detail={detail} />
      </div>

      {/* KART A · M5:35-43 — akış açıklaması. Mockup metni BİREBİR. */}
      <aside className="makine-kira__info" data-testid="makine-kira-info">
        <strong>Makine Kira Hakediş Akışı:</strong>
        <br />
        <strong>Kiralama Firması {"→"} Sana</strong> fatura keser (kiralanan
        makinenin bedelini firmaya ödersin).
        <br />
        Çalışma kayıtlarındaki saatlerle{" "}
        <strong>gelen faturayı doğrularsın</strong> {"→"} onaylarsın {"→"}{" "}
        ödersin.
        <br />
        Bu maliyet <strong>proje maliyetine</strong> yansır ve işveren
        hakedişinde hesaba katılır.
      </aside>

      {error !== null && (
        <Alert variant="danger" data-testid="makine-kira-detail-error">
          {error}
        </Alert>
      )}

      {/* KART B · M5:46-66 — kiralama firmasından gelen fatura. */}
      <section
        className="makine-kira__card"
        aria-labelledby="makine-kira-incoming-title"
      >
        <div className="makine-kira__card-body makine-kira__incoming">
          <h2
            id="makine-kira-incoming-title"
            className="makine-kira__card-title"
          >
            Kiralama Firmasından Gelen Fatura
          </h2>

          <Field label="Kiralama Firması" className="makine-kira__inline-field">
            {(control) => (
              <Select
                {...control}
                value={draft.supplierId}
                disabled={!editable}
                data-testid="makine-kira-supplier"
                onChange={(event) =>
                  setDraft({ ...draft, supplierId: event.target.value })
                }
              >
                {(suppliersQuery.data?.items ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
                {/* Sunucudaki tedarikçi listede yoksa seçenek KAYBOLMAZ. */}
                {!(suppliersQuery.data?.items ?? []).some(
                  (supplier) => supplier.id === detail.supplier_id,
                ) && (
                  <option value={detail.supplier_id}>
                    {detail.supplier_name ?? detail.supplier_id}
                  </option>
                )}
              </Select>
            )}
          </Field>

          <Field label="Fatura No" className="makine-kira__inline-field">
            {(control) => (
              <Input
                {...control}
                className="makine-kira__mono"
                value={draft.invoiceNo}
                disabled={!editable}
                maxLength={100}
                data-testid="makine-kira-invoice-no"
                onChange={(event) =>
                  setDraft({ ...draft, invoiceNo: event.target.value })
                }
              />
            )}
          </Field>

          <Field label="Fatura Tutarı" className="makine-kira__inline-field">
            {(control) => (
              <Input
                {...control}
                numeric
                inputMode="decimal"
                className="makine-kira__mono makine-kira__amount-input"
                value={draft.invoiceAmount}
                disabled={!editable}
                data-testid="makine-kira-invoice-amount-input"
                onChange={(event) =>
                  setDraft({ ...draft, invoiceAmount: event.target.value })
                }
              />
            )}
          </Field>

          <div className="makine-kira__incoming-end">
            {/* M5:65 — durum rozeti. */}
            <Badge variant={badge.variant} data-testid="makine-kira-status">
              {badge.label}
            </Badge>
          </div>
        </div>
      </section>

      {/* KART C · M5:69-77 — hakediş bilgileri. */}
      <section
        className="makine-kira__card"
        aria-labelledby="makine-kira-meta-title"
      >
        <div className="makine-kira__card-body">
          <h2 id="makine-kira-meta-title" className="makine-kira__card-title">
            Hakediş Bilgileri
          </h2>

          <div className="makine-kira__grid">
            <Field label="Dönem" className="makine-kira__field">
              {(control) => (
                <div className="makine-kira__period">
                  <Select
                    {...control}
                    aria-label="Dönem ayı"
                    value={draft.periodMonth}
                    disabled={!editable}
                    data-testid="makine-kira-period-month"
                    onChange={(event) =>
                      setDraft({ ...draft, periodMonth: event.target.value })
                    }
                  >
                    {PERIOD_MONTHS.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    aria-label="Dönem yılı"
                    value={draft.periodYear}
                    disabled={!editable}
                    data-testid="makine-kira-period-year"
                    onChange={(event) =>
                      setDraft({ ...draft, periodYear: event.target.value })
                    }
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                    {!years.includes(detail.period_year) && (
                      <option value={detail.period_year}>
                        {detail.period_year}
                      </option>
                    )}
                  </Select>
                </div>
              )}
            </Field>

            {/* 🔴 Mockup M5:73 bu seçiciye "Proje" diyor ama sunucu alanı
                `site_id`dir (ŞANTİYE) ve tablonun kolon başlığı da M5:89'da
                "Şantiye" yazar — mockup KENDİ İÇİNDE çelişik. Alan neyse o
                yazılır: bir şantiye seçicisini "Proje" diye etiketlemek ekranı
                verisini yalanlar hâle getirirdi (F-BOR kanonu). Seçenek etiketi
                zaten "{proje adı} {şantiye adı}" birleşimidir. */}
            <Field label="Şantiye" className="makine-kira__field">
              {(control) => (
                <Select
                  {...control}
                  value={draft.siteId}
                  disabled={!editable}
                  data-testid="makine-kira-site"
                  onChange={(event) =>
                    setDraft({ ...draft, siteId: event.target.value })
                  }
                >
                  {/* Bu bir SÜZGEÇ değil DÜZENLENEBİLİR alandır (94. kayıt) —
                      "Tüm Şantiyeler" liste süzgeçlerinin dilidir. Boş seçenek
                      `site_id: null` yazar, yani depodaki tek kaynak etiketle
                      (`rentalSiteLabel` → `RENTAL_UNASSIGNED_SITE_LABEL`)
                      hizalanır. */}
                  <option value="">{RENTAL_UNASSIGNED_SITE_LABEL}</option>
                  {siteOptions.options.map((option) => (
                    <option key={option.siteId} value={option.siteId}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Kira Tipi" className="makine-kira__field">
              {(control) => (
                <Select
                  {...control}
                  value={draft.ratePeriod}
                  disabled={!editable}
                  data-testid="makine-kira-rate-period"
                  onChange={(event) =>
                    setDraft({ ...draft, ratePeriod: event.target.value })
                  }
                >
                  {(
                    Object.keys(
                      RATE_PERIOD_LABEL,
                    ) as (keyof typeof RATE_PERIOD_LABEL)[]
                  ).map((period) => (
                    <option key={period} value={period}>
                      {RATE_PERIOD_LABEL[period]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {/* M5:75 — salt-okuma "Kaynak" kutusu. Şemada karşılığı YOKTUR;
                sunucunun davranışını (satırları çalışma kaydından kurar)
                anlatan sabit bir metindir, gövdeye GİTMEZ. */}
            <Field label="Kaynak" className="makine-kira__field">
              {(control) => (
                <Input
                  {...control}
                  readOnly
                  className="makine-kira__static"
                  value="Çalışma Kaydından"
                  data-testid="makine-kira-source"
                />
              )}
            </Field>
          </div>

          {editable && (
            <div className="makine-kira__card-foot">
              {/* 🔴 `POST …/reload` mockup'ta ÇİZİLMEMİŞ (K2) → basılmadı. Ama
                  sessiz kalınmaz: dönem/şantiye değişikliği satırları
                  KENDİLİĞİNDEN tazelemez ve kullanıcı bunu bilmelidir. */}
              <p
                className="makine-kira__reason"
                data-testid="makine-kira-reload-note"
              >
                {RENTAL_RELOAD_PENDING_REASON}
              </p>
              <Button
                variant="secondary"
                disabled={updateInvoice.isPending}
                onClick={handleSaveHeader}
                data-testid="makine-kira-save-header"
              >
                {updateInvoice.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* KART D · M5:80-174 */}
      <RentalLinesTable
        detail={detail}
        isEditable={editable}
        isSaving={updateLine.isPending}
        onSaveLine={handleSaveLine}
      />

      {/* KART E · M5:177-193 */}
      <RentalSiteDistributionCard entries={detail.site_distribution} />

      {/* Yüklendi işaretleri — her BAĞIMSIZ veri kaynağı ayrı ayrı (F-İK dersi:
          "yüklendi" iddiası ekranı besleyen HER kaynağı kapsar). */}
      {detailQuery.isSuccess && (
        <span hidden data-testid="makine-kira-loaded-detail" />
      )}
      {suppliersQuery.isSuccess && (
        <span hidden data-testid="makine-kira-loaded-suppliers" />
      )}
      {!siteOptions.isLoading && !siteOptions.isError && (
        <span hidden data-testid="makine-kira-loaded-sites" />
      )}
    </div>
  );
}
