"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import { useOffer, useOfferRevision } from "@/lib/api/hooks/useOffers";
import type { OfferDetailRead } from "@/lib/api/hooks/useOffers";
import { parseCountInput } from "@/lib/decimal";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { routes } from "@/lib/routes";

import { OfferDetailView, type OfferItemsSlotContext } from "./OfferDetailView";
import { OfferTabs } from "./OfferTabs";
import { readOnlyMessage } from "./OffersScreen";
import "./offers.css";

/** T25: teklif YAZMA = `contracts:full` + disiplin kısıtsız; okuma `contracts:view`. */
const WRITE_LEVEL = "full";
/** ÜS-F3-8: işveren eklemek `projects:admin`. */
const EMPLOYER_ADD_LEVEL = "admin";
/** TKL-F5.5 · SO-42: `POST /offers/{id}/convert` `projects:admin` ister. */
const PROJECTS_ADMIN_LEVEL = "admin";
const NOT_FOUND_STATUS = 404;
const REV_DIGITS = /^\d+$/;
/** Başarı bildiriminin ekranda kalma süresi (KIK/KAT emsali). */
const TOAST_MS = 2800;

/** `?rev=` metni → revizyon no; rakam olmayan/boş → `undefined` (güncel revizyon). */
export function parseRevParam(raw: string | null): number | undefined {
  if (raw === null || !REV_DIGITS.test(raw)) return undefined;
  return parseCountInput(raw) ?? undefined;
}

interface OfferDetailScreenProps {
  offerId: string;
  /** Ham `?rev=` değeri. */
  revParam: string | null;
  /** 🔌 F3.6 yuvası: kalem tablosu bölgesi (bkz. `OfferItemsSlotContext`). */
  renderItems?: (context: OfferItemsSlotContext) => ReactNode;
}

/**
 * TKL-F3.5 · `/teklif-hazirlama/{id}?rev=n` — Teklif Detay (kapsayıcı). ÇEKİRDEK ekran.
 * Kapı: `contracts:none` → AccessDenied; 403 (SO-19 kısıtlı kullanıcı / izin yarışı) da AccessDenied.
 */
export function OfferDetailScreen(props: OfferDetailScreenProps) {
  const { level } = useModulePermission("contracts");
  if (level === "none") return <AccessDenied />;
  return <OfferDetailContent {...props} />;
}

function OfferDetailContent({ offerId, revParam, renderItems }: OfferDetailScreenProps) {
  const router = useRouter();
  const { level } = useModulePermission("contracts");
  const projects = useModulePermission("projects");
  const scope = useDisciplineScope();
  const detailQuery = useOffer(offerId);
  // Toast revizyon ANAHTARININ ÜSTÜNDE yaşar: yeni revizyona geçişte görünüm yeniden kurulur, bildirim kalır.
  const [toast, setToast] = useState<{ text: string } | null>(null);
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (isForbidden(detailQuery.error)) return <AccessDenied />;
  if (detailQuery.data === undefined) {
    if (!detailQuery.isError) return <p className="offers-state">Teklif yükleniyor</p>;
    return detailQuery.error instanceof BackendError && detailQuery.error.status === NOT_FOUND_STATUS ? (
      <NotFound text="Teklif bulunamadı" />
    ) : (
      <LoadError onRetry={() => void detailQuery.refetch()} isRetrying={detailQuery.isFetching} />
    );
  }

  const detail = detailQuery.data;
  const requested = parseRevParam(revParam);
  const revNo = requested ?? detail.latest_rev_no;
  if (!detail.revisions.some((revision) => revision.rev_no === revNo)) {
    return <NotFound text={`Rev.${revNo} bulunamadı`} backTo={routes.offers.detail({ offerId })} />;
  }

  const canWrite = hasAtLeast(level, WRITE_LEVEL) && !scope.isRestricted;
  return (
    <OfferRevisionLoader
      key={`${offerId}:${revNo}`}
      detail={detail}
      revNo={revNo}
      canWrite={canWrite}
      canAddEmployer={hasAtLeast(projects.level, EMPLOYER_ADD_LEVEL)}
      canAdminProjects={hasAtLeast(projects.level, PROJECTS_ADMIN_LEVEL)}
      readOnlyText={readOnlyMessage(level, scope.isRestricted)}
      renderItems={renderItems}
      toast={toast?.text ?? null}
      onToast={(text) => setToast({ text })}
      onSelectRevision={(next) =>
        router.replace(routes.offers.detail({ offerId, ...(next === null ? {} : { rev: next }) }))
      }
    />
  );
}

interface OfferRevisionLoaderProps {
  detail: OfferDetailRead;
  revNo: number;
  canWrite: boolean;
  canAddEmployer: boolean;
  /** TKL-F5.5 · SO-42: dönüştürme `projects ≥ admin` ister. */
  canAdminProjects: boolean;
  readOnlyText: string;
  renderItems?: (context: OfferItemsSlotContext) => ReactNode;
  onSelectRevision: (revNo: number | null) => void;
  toast: string | null;
  onToast: (text: string) => void;
}

/** Revizyon okuması (koşullar + toplamlar) detay ÖZETİ varken açılır. */
function OfferRevisionLoader({ detail, revNo, ...rest }: OfferRevisionLoaderProps) {
  const revisionQuery = useOfferRevision(detail.id, revNo);
  if (isForbidden(revisionQuery.error)) return <AccessDenied />;
  if (revisionQuery.data === undefined) {
    return revisionQuery.isError ? (
      <LoadError onRetry={() => void revisionQuery.refetch()} isRetrying={revisionQuery.isFetching} />
    ) : (
      <p className="offers-state">Revizyon yükleniyor</p>
    );
  }
  return (
    <div className="offer-detail__page">
      <OfferTabs offerCount={null} catalogCount={null} listHref={routes.offers.list()} />
      <OfferDetailView detail={detail} revision={revisionQuery.data} {...rest} />
    </div>
  );
}

function NotFound({ text, backTo }: { text: string; backTo?: string }) {
  return (
    <div className="offers-state">
      <p>{text}</p>
      <Link href={backTo ?? routes.offers.list()} className="btn btn--secondary btn--md">
        {backTo ? "Güncel revizyona dön" : "Tekliflere dön"}
      </Link>
    </div>
  );
}

function LoadError({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  return (
    <div className="offers-state">
      <p>Teklif yüklenemedi</p>
      <Button variant="secondary" size="sm" onClick={onRetry} disabled={isRetrying}>
        Tekrar dene
      </Button>
    </div>
  );
}
