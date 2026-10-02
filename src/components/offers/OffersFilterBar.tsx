import { DateInput, Input, Select } from "@/components/ui";
import { SearchIcon } from "@/components/ui/icons";

import { OFFER_STATUSES, OFFER_STATUS_LABEL } from "./offer-status";
import type { OfferStatus } from "./offer-types";

const SEARCH_MAX_LENGTH = 100;

export interface EmployerOption {
  id: string;
  name: string;
}

interface OffersFilterBarProps {
  searchText: string;
  onSearchTextChange: (value: string) => void;
  status: OfferStatus | null;
  onStatusChange: (status: OfferStatus | null) => void;
  employerId: string | null;
  onEmployerChange: (employerId: string | null) => void;
  /** İşveren seçenekleri (sayaçsız — ÜS-F3-5). */
  employers: readonly EmployerOption[];
  /** Teklif tarihi aralığı, dahil-dahil (ISO `YYYY-MM-DD`; boş = sınır yok) — K-F3-1. */
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (isoDate: string) => void;
  onDateToChange: (isoDate: string) => void;
  /** Sunucunun bildirdiği süzülmüş toplam ("N teklif"). */
  count: number | null;
  hasFilter: boolean;
  onClear: () => void;
}

/** TL:102-133 — arama + Durum + İşveren + Tarih aralığı çipi + "Filtreleri temizle" + "N teklif". */
export function OffersFilterBar(props: OffersFilterBarProps) {
  const { status, employerId, employers } = props;
  return (
    <div className="offers-filters">
      <Input
        type="search"
        value={props.searchText}
        onChange={(event) => props.onSearchTextChange(event.target.value)}
        maxLength={SEARCH_MAX_LENGTH}
        placeholder="Teklif no, iş adı ya da işveren ara"
        aria-label="Teklif no, iş adı ya da işveren ara"
        leftIcon={<SearchIcon width={13} height={13} />}
        wrapperClassName="offers-filters__search"
      />
      <label className="offers-filter">
        <span className="offers-filter__label">Durum</span>
        <Select
          size="row"
          value={status ?? ""}
          onChange={(event) => props.onStatusChange(event.target.value === "" ? null : (event.target.value as OfferStatus))}
        >
          <option value="">Tümü</option>
          {OFFER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {OFFER_STATUS_LABEL[value]}
            </option>
          ))}
        </Select>
      </label>
      <label className="offers-filter">
        <span className="offers-filter__label">İşveren</span>
        <Select
          size="row"
          value={employerId ?? ""}
          onChange={(event) => props.onEmployerChange(event.target.value === "" ? null : event.target.value)}
        >
          <option value="">Tüm işverenler</option>
          {employers.map((employer) => (
            <option key={employer.id} value={employer.id}>
              {employer.name}
            </option>
          ))}
        </Select>
      </label>
      <div className="offers-filter offers-filter--chip" role="group" aria-label="Teklif tarihi aralığı">
        <span className="offers-filter__label">Tarih</span>
        <DateInput
          size="row"
          aria-label="Başlangıç tarihi"
          value={props.dateFrom}
          onValueChange={props.onDateFromChange}
        />
        <span className="offers-filter__dash" aria-hidden="true">
          –
        </span>
        <DateInput size="row" aria-label="Bitiş tarihi" value={props.dateTo} onValueChange={props.onDateToChange} />
      </div>
      {props.hasFilter && (
        <button type="button" className="offers-filters__clear" onClick={props.onClear}>
          Filtreleri temizle
        </button>
      )}
      {props.count !== null && (
        <span className="offers-filters__count" data-testid="offers-count">
          <b>{props.count}</b> teklif
        </span>
      )}
    </div>
  );
}
