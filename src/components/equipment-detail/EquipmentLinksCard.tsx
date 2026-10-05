"use client";

import Link from "next/link";

import { RENTAL_STATUS_BADGE } from "@/components/equipment-rental/rental-labels";
import { EQUIPMENT_EMPTY_VALUE } from "@/components/equipment/equipment-labels";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { EQUIPMENT_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrencyTight, formatPeriod } from "@/lib/format";
import type { EquipmentResponse } from "@/lib/api/hooks/useEquipment";
import type { RentalInvoiceResponse } from "@/lib/api/hooks/useEquipmentRentalInvoices";
import { routes } from "@/lib/routes";

/** Rotası olmayan mockup öğelerinin GÖRÜNÜR gerekçeleri (F-TH kalıcı kuralı:
 *  silinmez, devre-dışı basılır). */
export const SUPPLIER_INVOICE_LINK_REASON =
  "Gelen fatura bağlantısı yok: kira hakedişi şeması bir alış faturası kimliği taşımıyor.";
export const ASSET_REGISTRY_LINK_REASON =
  "Şirket Varlıkları ekranı henüz yok (rota tanımlı değil).";

export interface EquipmentLinksCardProps {
  equipment: EquipmentResponse;
  /** `undefined` ⇒ sorgu pending · `null` ⇒ bu ekipmanın hiç hakedişi yok. */
  latestInvoice: RentalInvoiceResponse | null | undefined;
}

/**
 * MD:272-293 · 💰 Mali Bağlantılar.
 *
 * 🔴 `GET /equipment/rental-invoices?equipment_id=…` NEYİN kümesidir: hakediş
 * BAŞLIKLARIDIR (`RentalInvoiceResponse`), satır değil. Şema ekipman başına
 * bir tutar TAŞIMAZ — `payable_total` FATURANIN tamamıdır ve birden çok
 * makineyi kapsayabilir. Bu yüzden bağlantı satırında basılan rakam faturanın
 * toplamıdır ve etiketi de öyle yazar; "bu makinenin kirası" diye basmak
 * başka makinelerin parasını bu ekrana yazmak olurdu.
 */
export function EquipmentLinksCard({ equipment, latestInvoice }: EquipmentLinksCardProps) {
  const isRented = equipment.ownership === "rented";
  const isPaymentHidden = useCategoryHidden(EQUIPMENT_PAYMENT_HIDDEN_CATEGORIES);

  return (
    <section className="makine-det__card" aria-label="Mali Bağlantılar">
      <h2 className="makine-det__card-title">💰 Mali Bağlantılar</h2>

      <div className="makine-det__links">
        {/* MD:275-282 — en güncel kira hakedişi. */}
        {latestInvoice ? (
          <Link
            href={routes.equipment.rentalInvoiceDetail({ invoiceId: latestInvoice.id })}
            className="makine-det__link"
            data-testid="makine-det-link-invoice"
          >
            <span className="makine-det__link-icon" aria-hidden="true">
              💰
            </span>
            <span className="makine-det__link-body">
              <span className="makine-det__link-title">
                {formatPeriod(latestInvoice.period_year, latestInvoice.period_month)} Kira
                Hakedişi
              </span>
              <span className="makine-det__link-note">
                {latestInvoice.invoice_no ?? "Fatura no yok"} ·{" "}
                {RENTAL_STATUS_BADGE[latestInvoice.status].label} · fatura toplamı
              </span>
            </span>
            <span className="makine-det__link-amount">
              {latestInvoice.payable_total === null
                ? EQUIPMENT_EMPTY_VALUE
                : formatCurrencyTight(latestInvoice.payable_total)}
              <MaskedMark isHidden={isPaymentHidden} values={[latestInvoice.payable_total]} />
            </span>
          </Link>
        ) : (
          <span className="makine-det__link makine-det__link--muted" data-testid="makine-det-link-invoice-empty">
            <span className="makine-det__link-icon" aria-hidden="true">
              💰
            </span>
            <span className="makine-det__link-body">
              <span className="makine-det__link-title">Kira Hakedişi</span>
              <span className="makine-det__link-note">
                {latestInvoice === undefined
                  ? "Yükleniyor…"
                  : "Bu ekipmanın satırını taşıyan bir kira hakedişi yok."}
              </span>
            </span>
            <Link href={routes.equipment.rentalInvoices()} className="makine-det__link-more">
              Tümü →
            </Link>
          </span>
        )}

        {/* MD:283-289 — mockup gelen faturaya bağlanıyor; ŞEMADA böyle bir bağ
            YOK. Öğe SİLİNMEZ, devre-dışı + görünür gerekçeyle basılır. */}
        <span
          className="makine-det__link makine-det__link--disabled"
          aria-disabled="true"
          title={SUPPLIER_INVOICE_LINK_REASON}
          data-testid="makine-det-link-supplier-invoice"
        >
          <span className="makine-det__link-icon" aria-hidden="true">
            🧾
          </span>
          <span className="makine-det__link-body">
            <span className="makine-det__link-title">Tedarikçi Faturası</span>
            <span className="makine-det__link-note">{SUPPLIER_INVOICE_LINK_REASON}</span>
          </span>
        </span>

        {/* MD:290-296 — `Varlık Kaydı`. `/varliklar` rotası YOKTUR (ölçüm:
            `src/app/(app)` altında böyle bir segment yok). */}
        <span
          className="makine-det__link makine-det__link--disabled"
          aria-disabled="true"
          title={ASSET_REGISTRY_LINK_REASON}
          data-testid="makine-det-link-asset"
        >
          <span className="makine-det__link-icon" aria-hidden="true">
            🏛
          </span>
          <span className="makine-det__link-body">
            <span className="makine-det__link-title">Varlık Kaydı</span>
            <span className="makine-det__link-note">{ASSET_REGISTRY_LINK_REASON}</span>
          </span>
        </span>
      </div>

      {/* MD:297-300 — sahiplik açıklaması. */}
      <p className="makine-det__band" data-testid="makine-det-asset-band">
        {isRented ? (
          <>
            <strong>Kendi ekipmanı</strong> olsaydı burada alış bedeli, amortisman oranı ve net
            defter değeri de görünürdü. Kiralık ekipmanda bu alanlar boş bırakılır.
          </>
        ) : (
          <>
            Bu ekipman <strong>kendi malımızdır</strong> — alış bedeli, amortisman süresi ve
            piyasa değeri künyede saklanır; bilançoda varlık olarak görünür.
          </>
        )}
      </p>
    </section>
  );
}
