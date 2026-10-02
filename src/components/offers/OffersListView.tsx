import Link from "next/link";

import { Button } from "@/components/ui";
import { LockIcon } from "@/components/ui/icons";
import { routes } from "@/lib/routes";

import { OfferStatusCards } from "./OfferStatusCards";
import { OfferTabs } from "./OfferTabs";
import { OffersEmptyState } from "./OffersEmptyState";
import { OffersFilterBar, type EmployerOption } from "./OffersFilterBar";
import { OffersTable } from "./OffersTable";
import { buildStatusCards } from "./offer-list-model";
import { istanbulToday } from "./offer-status";
import type { OfferListItem, OfferListResponse, OfferStatus } from "./offer-types";
import "./offers.css";

export type OffersBodyState =
  | { kind: "loading" }
  | { kind: "error"; isRetrying: boolean; onRetry: () => void }
  | { kind: "ready"; data: OfferListResponse };

export interface OffersListViewProps {
  body: OffersBodyState;
  status: OfferStatus | null;
  employerId: string | null;
  searchText: string;
  onStatusChange: (status: OfferStatus | null) => void;
  onEmployerChange: (employerId: string | null) => void;
  onSearchTextChange: (value: string) => void;
  onClear: () => void;
  employers: readonly EmployerOption[];
  catalogCount: number | null;
  canWrite: boolean;
  /** Yazma yetkisi yoksa şerit metni (boş = şerit yok). */
  readOnlyText: string;
  now: Date;
  busyOfferId: string | null;
  onNewRevision: (item: OfferListItem) => void;
  onDelete: (item: OfferListItem) => void;
  toast: string | null;
  actionError: string | null;
}

/** TL:86-187 — Teklifler listesi (SUNUMSAL: veri ve işlemler props'tan; kapsayıcı `OffersScreen`). */
export function OffersListView(props: OffersListViewProps) {
  const { body, status, employerId, searchText } = props;
  const hasFilter = status !== null || employerId !== null || searchText.trim() !== "";
  const data = body.kind === "ready" ? body.data : null;
  const isUnfilteredByParty = employerId === null && searchText.trim() === "";
  const offerCount =
    data !== null && isUnfilteredByParty ? data.summary.by_status.reduce((sum, row) => sum + row.count, 0) : null;

  return (
    <div className="offers">
      <OfferTabs offerCount={offerCount} catalogCount={props.catalogCount} />

      <header className="offers__head">
        <div className="offers__titles">
          <h1 className="offers__title">Teklifler</h1>
          <p className="offers__lead">
            İşverenlere hazırlanan keşif ve fiyat teklifleri · kazanılan teklif projeye dönüşür
          </p>
        </div>
        {props.canWrite && (
          <Link href={routes.offers.new()} className="btn btn--primary btn--md">
            + Yeni Teklif
          </Link>
        )}
      </header>

      {props.readOnlyText && (
        <div role="note" className="offers-readonly">
          <LockIcon className="offers-readonly__icon" />
          <span>{props.readOnlyText}</span>
        </div>
      )}
      {props.toast && (
        <div className="offers-toast" role="status">
          {props.toast}
        </div>
      )}
      {props.actionError && (
        <p className="offers-error" role="status">
          {props.actionError}
        </p>
      )}

      {data !== null && (
        <OfferStatusCards
          cards={buildStatusCards(data.summary)}
          activeStatus={status}
          onToggle={(clicked) => props.onStatusChange(status === clicked ? null : clicked)}
        />
      )}

      <section className="offers__card" aria-label="Teklif listesi">
        <OffersFilterBar
          searchText={searchText}
          onSearchTextChange={props.onSearchTextChange}
          status={status}
          onStatusChange={props.onStatusChange}
          employerId={employerId}
          onEmployerChange={props.onEmployerChange}
          employers={props.employers}
          count={data?.total ?? null}
          hasFilter={hasFilter}
          onClear={props.onClear}
        />
        <OffersBody {...props} hasFilter={hasFilter} />
      </section>
    </div>
  );
}

function OffersBody(props: OffersListViewProps & { hasFilter: boolean }) {
  const { body } = props;
  if (body.kind === "loading") return <p className="offers-state">Teklifler yükleniyor</p>;
  if (body.kind === "error") {
    return (
      <div className="offers-state">
        <p>Teklifler yüklenemedi</p>
        <Button variant="secondary" size="sm" onClick={body.onRetry} disabled={body.isRetrying}>
          Tekrar dene
        </Button>
      </div>
    );
  }
  const { items, total } = body.data;
  if (items.length === 0) {
    return <OffersEmptyState variant={props.hasFilter ? "filtered" : "none"} canWrite={props.canWrite} onClear={props.onClear} />;
  }
  return (
    <>
      <OffersTable
        items={items}
        total={total}
        canWrite={props.canWrite}
        today={istanbulToday(props.now)}
        busyOfferId={props.busyOfferId}
        onNewRevision={props.onNewRevision}
        onDelete={props.onDelete}
      />
      <div className="offers-legend">
        <span>Tutarlar ₺</span>
        <span>KDV dahil tutar her teklifin kendi KDV oranıyla</span>
        <span>süresi geçmiş gönderilmiş teklifler kırmızı</span>
      </div>
    </>
  );
}
