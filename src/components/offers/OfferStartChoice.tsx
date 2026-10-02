import "./offer-create.css";

/** B5/F4 gelene kadar yalnız boş teklif çalışır; diğer ikisi F-TH kanonuyla silinmez, gerekçeyle pasif basılır (GECE KURALI). */
const TEMPLATE_SOON_TITLE = "Yakında · şablondan başlama sonraki sürümde açılacak";
const COPY_SOON_TITLE = "Yakında · mevcut tekliften kopyalama sonraki sürümde açılacak";
const MANAGE_SOON_TITLE = "Yakında · şablon yönetimi sonraki sürümde açılacak";

interface StartOption {
  key: "blank" | "template" | "copy";
  label: string;
  description: string;
  soonTitle: string | null;
}

const OPTIONS: readonly StartOption[] = [
  { key: "blank", label: "Boş teklif", description: "Kalemleri katalogdan tek tek ekleyin", soonTitle: null },
  {
    key: "template",
    label: "Şablondan",
    description: "Hazır kalem setiyle başlayın, miktarları girin",
    soonTitle: TEMPLATE_SOON_TITLE,
  },
  {
    key: "copy",
    label: "Mevcut tekliften kopyala",
    description: "Benzer bir işin kalem ve fiyatlarını alın",
    soonTitle: COPY_SOON_TITLE,
  },
];

/** TY:77-109 — "Nereden başlansın?". Seçim DAİMA "Boş teklif" (şablon / kopya B5-F4'te açılır). */
export function OfferStartChoice() {
  return (
    <section className="offer-create__card" aria-labelledby="offer-start-title">
      <div>
        <h2 className="offer-create__card-title" id="offer-start-title">
          Nereden başlansın?
        </h2>
        <span className="offer-create__card-sub">
          Kalemler başlangıca göre doldurulur; sonradan hepsi düzenlenebilir ·{" "}
          <button type="button" className="offer-start__manage" disabled title={MANAGE_SOON_TITLE}>
            Şablonları yönet →
          </button>
        </span>
      </div>
      <div className="offer-start" role="radiogroup" aria-labelledby="offer-start-title">
        {OPTIONS.map((option) => {
          const isBlank = option.soonTitle === null;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={isBlank}
              disabled={!isBlank}
              title={option.soonTitle ?? undefined}
              className="offer-start__option"
            >
              <span className="offer-start__top">
                <span className="offer-start__radio" aria-hidden="true">
                  {isBlank && <span className="offer-start__dot" />}
                </span>
                {option.label}
                {!isBlank && <span className="offer-start__soon">Yakında</span>}
              </span>
              <span className="offer-start__desc">{option.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
