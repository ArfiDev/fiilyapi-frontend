"use client";

import Link from "next/link";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES, EQUIPMENT_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrencyTight, formatDateDots } from "@/lib/format";
import type { EquipmentResponse } from "@/lib/api/hooks/useEquipment";
import type { EquipmentRentalTotals } from "@/lib/api/hooks/useEquipmentDetailScreen";

import { DetailKv } from "./DetailKv";
import { RATE_PERIOD_ROW_LABELS } from "./equipment-detail-labels";
import { routes } from "@/lib/routes";

export interface EquipmentRentalCardProps {
  equipment: EquipmentResponse;
  rental: EquipmentRentalTotals;
  /** `undefined` ⇒ tedarikçi sorgusu pending · `null` ⇒ tedarikçi atanmamış
   *  ya da bulunamadı. İkisi AYRI basılır. */
  supplierName: string | null | undefined;
  /** kalan-4 #182: tedarikçi sorgusu HATA verdi (ör. `procurement:view`
   *  izni yok) — `supplierName` bu durumda da `undefined` kalır, bu bayrak
   *  kalıcı "Yükleniyor…" yerine görünür bir hata notu basılmasını sağlar. */
  supplierIsError?: boolean;
}

/**
 * MD:124-142 · 📋 Kiralama Bilgileri.
 *
 * Kartın SEKİZ satırından yedisi `EquipmentResponse`ta SAKLANIR; tek türev
 * `Kümülatif Ödenen`dir (MD:132) ve `EquipmentRentalTotals`tan gelir.
 *
 * 🔴 `cumulative_paid` NEYİN toplamıdır — sorgu gövdesinden:
 * `rental_repository.paid_lines_for_equipment` YALNIZ `status = paid`
 * hakedişlerin bu ekipmana ait satırlarını döner, servis de bunların YALNIZ
 * `line_kind = rented` olanlarını toplar. Yani `approved` (onaylanmış ama
 * ödenmemiş) hakediş bu sayıya GİRMEZ.
 *
 * 🔴 `0` toplam "hiç ödeme yok" DEMEK DEĞİLDİR: `paid_invoice_count`
 * `line_kind` süzgecinden ÖNCE sayılır (`detail_service._rental_totals`),
 * bu yüzden ödenmiş hakedişi olduğu hâlde `rented` satırı olmayan bir
 * ekipmanda sayaç > 0 iken toplam 0'dır. Ekran ikisini birlikte basar.
 *
 * 🔴 Hesaplanamayan satır SESSİZ DÜŞMEZ: `cumulative_paid_unknown_count`
 * görünür bir notla söylenir (MK-1 `summarize` kanonu).
 */
export function EquipmentRentalCard({
  equipment,
  rental,
  supplierName,
  supplierIsError = false,
}: EquipmentRentalCardProps) {
  const isRented = equipment.ownership === "rented";
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  const isPaymentHidden = useCategoryHidden(EQUIPMENT_PAYMENT_HIDDEN_CATEGORIES);
  // IZN-F4d.2: toplam gizliyse (`null`) "hesaplanamadı" bandı BASILMAZ — yalan olurdu (kilit değerin yanında).
  const unknown = rental.cumulative_paid === null ? 0 : rental.cumulative_paid_unknown_count;

  return (
    <section className="makine-det__card" aria-label="Kiralama Bilgileri">
      <h2 className="makine-det__card-title">📋 Kiralama Bilgileri</h2>

      {/* 🔴 MD:126 `Kiralayan Firma`. Etiket SAHİPLİKTEN türer: `supplier_id`
          sunucuda TEK bir tedarikçi kaydıdır ve M2 formunun kendi ipucu bunu
          söyler ("Satıcı ve kiralama firması TEK tedarikçi kaydıdır").
          KENDİ MALIMIZ bir makinede o kayıt SATICIDIR; "Kiralayan Firma"
          diye basmak kullanıcıya var olmayan bir kira ilişkisi anlatırdı. */}
      <DetailKv
        label={isRented ? "Kiralayan Firma" : "Satıcı Firma"}
        value={
          supplierName === undefined
            ? supplierIsError
              ? "Görüntüleme yetkiniz yok"
              : "Yükleniyor…"
            : supplierName
        }
        testId="makine-det-supplier"
      />
      <DetailKv label="Sözleşme No" value={equipment.rental_contract_no} tones={["mono"]} />
      <DetailKv
        label="Kira Başlangıç"
        value={
          equipment.rental_start_date === null
            ? null
            : formatDateDots(equipment.rental_start_date)
        }
        tones={["mono"]}
      />
      {/* MD:129 — bitiş tarihi mockup'ta amber; yaklaşan bir bitiş uyarıdır. */}
      <DetailKv
        label="Kira Bitiş"
        value={
          equipment.rental_end_date === null ? null : formatDateDots(equipment.rental_end_date)
        }
        tones={["mono", "warning"]}
      />
      {/* MD:130 — başlık DÖNEMDEN türer; mockup yalnız `Saatlik` hâlini çizer. */}
      <DetailKv
        label={
          equipment.rate_period === null
            ? "Kira Bedeli"
            : RATE_PERIOD_ROW_LABELS[equipment.rate_period]
        }
        value={
          equipment.rate_amount === null ? null : formatCurrencyTight(equipment.rate_amount)
        }
        tones={["mono"]}
        mark={<MaskedMark isHidden={isCostHidden} values={[equipment.rate_amount]} />}
      />
      <DetailKv
        label="Aylık Asgari Saat"
        value={
          equipment.rental_min_monthly_hours === null
            ? null
            : `${equipment.rental_min_monthly_hours} saat`
        }
        tones={["mono"]}
      />
      <DetailKv label="Ödeme Şekli" value={equipment.rental_payment_terms} />
      {/* MD:132 */}
      <DetailKv
        label="Kümülatif Ödenen"
        value={rental.cumulative_paid === null ? null : formatCurrencyTight(rental.cumulative_paid)}
        tones={["mono", "success"]}
        mark={<MaskedMark isHidden={isPaymentHidden} values={[rental.cumulative_paid]} />}
        testId="makine-det-cumulative-paid"
      />

      {unknown > 0 && (
        <p className="makine-det__band makine-det__band--warning" data-testid="makine-det-rental-unknown">
          Ödenmiş hakedişlerin {unknown} satırının tutarı hesaplanamadı (kira bedeli ya da
          dönemi tanımlı değil) ve toplama GİRMEDİ.
        </p>
      )}

      {/* MD:133-140 — açıklama bandı. Metin SAHİPLİKTEN türer: mockup yalnız
          kiralık hâlini çiziyor ama aynı ekran kendi malımız ekipmanda da
          açılır ve o cümle orada YANLIŞ olurdu. İkinci cümle mockup'ın
          MD:289-292'deki kendi karşılığından alınmıştır — uydurulmadı. */}
      <p className="makine-det__band" data-testid="makine-det-ownership-band">
        {isRented ? (
          <>
            Bu ekipman <strong>kiralıktır</strong> — amortisman hesaplanmaz, satın alma
            bilgileri boştur. Kira bedeli{" "}
            <Link href={routes.equipment.rentalInvoices()} className="makine-det__card-more">
              kira hakedişine
            </Link>{" "}
            yansır.
          </>
        ) : (
          <>
            Bu ekipman <strong>kendi malımızdır</strong> — kiralama alanları boştur;
            alış bedeli, amortisman ve net defter değeri varlık kaydında tutulur.
          </>
        )}
      </p>
      {/* `paid_invoice_count` toplamın YORUMUDUR: 0 iken `₺0` gerçekten
          "hiç ödeme yok"tur, 0 değilken 0 toplam BAŞKA bir şey söyler. */}
      <p className="makine-det__band" data-testid="makine-det-paid-count">
        Kümülatif toplam, bu ekipmanın satırını taşıyan {rental.paid_invoice_count} ödenmiş
        kira hakedişinden okundu.
      </p>
    </section>
  );
}
