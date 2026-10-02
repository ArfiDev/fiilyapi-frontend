import { useState } from "react";

import { Button, Input } from "@/components/ui";
import { SearchIcon } from "@/components/ui/icons";
import { useOffers, type OfferListItem } from "@/lib/api/hooks/useOffers";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { cx } from "@/lib/cx";

import { OFFER_STATUS_LABEL, OFFER_STATUS_TONE } from "./offer-status";
import { formatCompactNet } from "./offer-start";
import "./offers.css";
import "./offer-create.css";

/** ÜS-F4-12: kopya kaynağı listesi ilk 8 teklifle sınırlıdır; gerisi arama ile bulunur. */
const COPY_LIST_LIMIT = 8;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MAX_LENGTH = 100;
const SEARCH_LABEL = "Teklif no, iş adı ya da işveren ara";

interface OfferStartCopyProps {
  selectedOfferId: string | null;
  onSelect: (offer: OfferListItem) => void;
}

/** TY:96-108 — "Mevcut tekliften kopyala" listesi (radyo · TKL no · iş adı · KDV hariç net · durum) + arama (ÜS-F4-12). */
export function OfferStartCopy({ selectedOfferId, onSelect }: OfferStartCopyProps) {
  const [searchText, setSearchText] = useState("");
  const q = useDebouncedValue(searchText.trim(), SEARCH_DEBOUNCE_MS);
  const query = useOffers({ q, limit: COPY_LIST_LIMIT });
  const items = query.data?.items;

  return (
    <div className="offer-start__copy-wrap">
      <Input
        type="search"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        // Form içinde Enter formu GÖNDERİRDİ (teklif yanlışlıkla oluşurdu).
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        maxLength={SEARCH_MAX_LENGTH}
        placeholder={SEARCH_LABEL}
        aria-label={SEARCH_LABEL}
        leftIcon={<SearchIcon width={13} height={13} />}
      />
      {query.isError ? (
        <div className="offer-start__state">
          <span>Teklifler yüklenemedi</span>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
            Tekrar dene
          </Button>
        </div>
      ) : items === undefined ? (
        <p className="offer-start__state">Teklifler yükleniyor</p>
      ) : items.length === 0 ? (
        <p className="offer-start__state">Eşleşen teklif yok</p>
      ) : (
        <div className="offer-start__copy" role="radiogroup" aria-label="Kopyalanacak teklif">
          {items.map((offer) => {
            const isSelected = offer.id === selectedOfferId;
            return (
              <button
                key={offer.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className="offer-start__copy-row"
                onClick={() => onSelect(offer)}
              >
                <span className="offer-start__copy-radio" aria-hidden="true">
                  {isSelected && <span className="offer-start__copy-dot" />}
                </span>
                <span className="offer-start__copy-no">{offer.offer_no}</span>
                <span className="offer-start__copy-job">{offer.title}</span>
                <span className="offer-start__copy-net">{formatCompactNet(offer.net)}</span>
                <span className="offer-start__copy-status">
                  <span className={cx("offers-pill", `offers-tone--${OFFER_STATUS_TONE[offer.status]}`)}>
                    {OFFER_STATUS_LABEL[offer.status]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
