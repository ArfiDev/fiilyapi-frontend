/** TD:270-274 — lejant: genel oran · kalemde elle değiştirildi · a-s notu. */
export function OfferItemsLegend() {
  return (
    <div className="oit-legend">
      <span className="oit-legend__item">
        <span className="oit-legend__swatch" />
        genel oran
      </span>
      <span className="oit-legend__item">
        <span className="oit-legend__swatch oit-legend__swatch--override" />
        kalemde elle değiştirildi
      </span>
      <span>Adam-saat / birim İş Kalemi Kataloğu&apos;ndan önerilir · bu teklif için değiştirilebilir, katalog değişmez</span>
    </div>
  );
}
