import { formatDateDots } from "@/lib/format";

import "./offer-create.css";

interface OfferCreateSummaryProps {
  /** "Boş teklif" / "Şablon · {ad}" / "Kopya · TKL-… Rev.n" (TY startLbl). */
  startLabel: string;
  employerName: string;
  title: string;
  validityDays: string;
  /** Hesaplanan bitiş (ISO) ya da `null`. */
  validUntil: string | null;
  overheadPct: string;
  profitPct: string;
  vatPct: string;
}

/** TY:178 — mavi not (aynen). */
const NOTE_TAIL = "olarak kaydedilir ve kalem tablosu açılır.";

/** TY:172-180 — sağdaki "Oluşturulacak teklif" özet kartı (yalnız sunum). */
export function OfferCreateSummary(props: OfferCreateSummaryProps) {
  const until = props.validUntil === null ? "–" : formatDateDots(props.validUntil);
  const rows: readonly { label: string; value: string }[] = [
    { label: "Teklif no", value: "Oluşturunca verilir" },
    { label: "Başlangıç", value: props.startLabel },
    { label: "İşveren", value: props.employerName },
    { label: "İş adı", value: props.title.trim() },
    { label: "Geçerlilik", value: `${props.validityDays} gün → ${until}` },
    { label: "Oranlar", value: `GG %${props.overheadPct} · Kâr %${props.profitPct} · KDV %${props.vatPct}` },
  ];
  return (
    <aside className="offer-summary" aria-labelledby="offer-summary-title">
      <h2 className="offer-create__card-title" id="offer-summary-title">
        Oluşturulacak teklif
      </h2>
      <dl className="offer-summary__rows">
        {rows.map((row) => (
          <div key={row.label} className={row.value === "" ? "offer-summary__row offer-summary__row--empty" : "offer-summary__row"}>
            <dt>{row.label}</dt>
            <dd>{row.value === "" ? "—" : row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="offer-summary__note">
        Oluşturunca teklif <b>Taslak</b> {NOTE_TAIL}
      </p>
    </aside>
  );
}
