"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Input } from "@/components/ui";
import { SearchIcon } from "@/components/ui/icons";
import { downloadChartOfAccountsExport } from "@/lib/api/accounting-export-client";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useDeleteChartAccount, useUpdateChartAccount } from "@/lib/api/hooks/useChartOfAccountMutations";
import type { ChartAccountResponse } from "@/lib/api/hooks/useChartOfAccounts";
import {
  CHART_ACCOUNTS_MAX_LIMIT,
  useChartOfAccounts,
} from "@/lib/api/hooks/useChartOfAccounts";
import { isForbidden } from "@/lib/api/unwrap";
import { CHART_OF_ACCOUNTS_EDIT, ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import {
  ACCOUNTING_REASONS,
  ACCOUNTING_URL,
} from "./accounting-labels";
import { AccountingTabs } from "./shell/AccountingTabs";
import { ChartAccountFormModal } from "./ChartAccountFormModal";
import { buildChartRows } from "./chart-of-accounts-rows";
import { ChartOfAccountsTable } from "./ChartOfAccountsTable";
import "./accounting.css";

/**
 * HP:50 `+ Hesap Ekle` ve satır `Düzenle` düğmelerinin AÇTIĞI diyaloğun
 * durumu; gövdesi `ChartAccountFormModal`dır (T4).
 */
export type ChartAccountDialogState =
  | { readonly mode: "create" }
  | { readonly mode: "edit"; readonly accountId: string };

/** Her tuş vuruşunda ağa çıkılmaz; son yazım kazanır. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * HP · `/muhasebe/hesap-plani` — mockup `Muhasebe - Hesap Planı.dc.html`.
 * Yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın üst barı (18-26) ve sol menüsü (28-38) BASILMAZ: üst bar
 * kabuk canon'udur; MODÜL sekmeleri ise sol menüde DEĞİL, sayfa içi
 * `AccountingTabs` şeridindedir (F-MUP · KK-10 ile drill-in sidebar kalktı).
 *
 * ⚠️ ARAMA SUNUCUYA GİDER (`q`); istemcide süzülen hiçbir şey YOKTUR — aksi
 * hâlde sayfalanan kümenin (tavan 200) dışındaki eşleşmeler sessizce
 * kaybolurdu.
 */
export function ChartOfAccountsView() {
  const canViewAccounting = useButtonGate({ pages: ACCOUNTING_VIEW, need: "view" });
  // IZN-F2.x · hesap ekle/düzenle = mali.hesap_plani/yevmiye/donem_kapanisi Düzenler (VEYA); hesap SİLME = yalnız SA.
  const canEditAccounts = useButtonGate({ pages: CHART_OF_ACCOUNTS_EDIT, need: "edit" });
  const canDeleteAccounts = useButtonGate({ pages: CHART_OF_ACCOUNTS_EDIT, need: "sa" });

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [dialog, setDialog] = useState<ChartAccountDialogState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const trimmedSearch = debouncedSearch.trim();

  /**
   * 🔴 EXPORT-XLSX · SIZINTI KURALI — TEK süzgeç nesnesi. Liste sorgusu da
   * Excel çağrısı da BU nesneden beslenir; iki ayrı yerde kurulsalardı biri
   * (ör. arama kutusu) sessizce geride kalır ve kullanıcı SÜZDÜĞÜNÜ sanarak
   * TÜM hesap planını indirirdi.
   *
   * `limit` bilerek DIŞARIDA: sayfalama bir süzgeç değildir (aşağıda liste
   * çağrısına ayrıca eklenir), Excel tavanla kısıtlanmaz.
   */
  const filters = useMemo(
    () => (trimmedSearch.length > 0 ? { q: trimmedSearch } : {}),
    [trimmedSearch],
  );

  const accountsQuery = useChartOfAccounts({ limit: CHART_ACCOUNTS_MAX_LIMIT, ...filters });

  const updateMutation = useUpdateChartAccount();
  const deleteMutation = useDeleteChartAccount();

  const accounts = accountsQuery.data?.items;
  const rows = useMemo(() => buildChartRows(accounts), [accounts]);

  if (!canViewAccounting || isForbidden(accountsQuery.error)) {
    return <AccessDenied />;
  }

  // 🔴 `limit` tavanı 200 ve aşımda uç 422 verir (kırpma DEĞİL) — bu yüzden
  // tavanla istenir ve `total > items.length` ise GÖRÜNÜR bir bant basılır.
  const truncation = buildListTruncation(accounts?.length ?? 0, accountsQuery.data?.total);

  /** Hata YUTULMAZ: sunucunun Türkçe `detail` metni (409/403) ekrana basılır. */
  function handleDeactivate(accountId: string) {
    setBusyAccountId(accountId);
    setActionError(null);
    updateMutation.mutate(
      { accountId, body: { is_active: false } },
      {
        onSettled: () => setBusyAccountId(null),
        onError: (error) =>
          setActionError(backendErrorMessage(error, "Hesap pasifleştirilemedi.")),
      },
    );
  }

  /** `AuditLogScreen` kanonu: uçuşta kilit, hata GÖRÜNÜR. */
  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      await downloadChartOfAccountsExport(filters);
    } catch (error) {
      setExportError(backendErrorMessage(error, "Hesap planı Excel dosyası indirilemedi."));
    } finally {
      setIsExporting(false);
    }
  }

  function handleDelete(accountId: string) {
    setBusyAccountId(accountId);
    setActionError(null);
    deleteMutation.mutate(accountId, {
      onSettled: () => setBusyAccountId(null),
      // 409'un gövdesi Türkçedir ("Bu hesaba bağlı yevmiye kayıtları var; hesap
      // silinemez") — HAM hata basılmaz, `backendErrorMessage` onu okur.
      onError: (error) => setActionError(backendErrorMessage(error, "Hesap silinemedi.")),
    });
  }

  return (
    <div className="mu">
      {/* HP:41 — kabuğun breadcrumb'ı yerine mockup'ın geri bağlantısı. */}
      <p className="mu__eyebrow">
        <Link href={ACCOUNTING_URL} className="mu__back" data-testid="hp-back">
          ← Muhasebe
        </Link>
      </p>

      <div className="mu__head">
        {/* HP:43 */}
        <h1 className="mu__title">Hesap Planı</h1>
        <div className="mu__actions">
          {/* HP:45-48 — lupa ikonu `ui/icons`ten; çıplak SVG gömülmez. */}
          <Input
            size="row"
            type="search"
            aria-label="Hesap ara"
            placeholder="Hesap ara..."
            value={search}
            leftIcon={<SearchIcon />}
            data-testid="hp-search"
            onChange={(event) => setSearch(event.target.value)}
          />
          {/* 🔴 HP:49 — EXPORT-XLSX ile GERÇEK: `GET /chart-of-accounts/export.xlsx`.
              Arama kutusu ne süzüyorsa dosya da ONU taşır. */}
          <Button
            variant="secondary"
            data-testid="hp-export"
            disabled={isExporting}
            onClick={handleExport}
          >
            Excel
          </Button>
          {/* HP:50 — `ChartAccountFormModal`ı açar (T4). */}
          <Button
            variant="primary"
            disabled={!canEditAccounts}
            data-testid="hp-create"
            onClick={() => setDialog({ mode: "create" })}
          >
            + Hesap Ekle
          </Button>
        </div>
      </div>

      {/* F-MUP T1 — MP:105-112 modül sekmeleri; drill-in sidebar'ın YERİNE.
          Şerit sayfa BAŞLIĞININ ALTINDADIR (MP:103 → MP:105). */}
      <AccountingTabs />

      {exportError !== null && (
        <p className="mu-notice mu-notice--danger" data-testid="hp-export-error">
          {exportError}
        </p>
      )}
      {!canEditAccounts && (
        <p className="mu-notice" data-testid="hp-write-notice">
          {ACCOUNTING_REASONS.write}
        </p>
      )}
      {truncation.isTruncated && (
        <p className="mu-notice" data-testid="hp-truncation">
          {listTruncationMessage(truncation)}
        </p>
      )}
      {actionError !== null && (
        <p className="mu-notice mu-notice--danger" data-testid="hp-action-error">
          {actionError}
        </p>
      )}

      {/* HP:54 — tablo kartı. */}
      <section className="mu-panel" aria-label="Hesap Planı">
        <ChartOfAccountsTable
          rows={rows}
          isLoading={accountsQuery.isLoading}
          errorMessage={
            accountsQuery.isError
              ? backendErrorMessage(accountsQuery.error, "Hesap planı yüklenemedi.")
              : undefined
          }
          isFiltered={trimmedSearch.length > 0}
          canWrite={canEditAccounts}
          canDelete={canDeleteAccounts}
          busyAccountId={busyAccountId}
          onEdit={(accountId) => setDialog({ mode: "edit", accountId })}
          onDeactivate={handleDeactivate}
          onDelete={handleDelete}
        />
      </section>

      {dialog !== null && (
        // 🔴 Düzenleme kipinde hesap LİSTEDEN okunur; ikinci bir detay isteği
        // atılmaz — liste satırı zaten dört alanın hepsini taşır. Satır bu arada
        // listeden düşmüşse (arama daraldı vb.) diyalog OLUŞTURMA kipine
        // sessizce kaymaz: yuva kapanır.
        <ChartAccountDialogHost
          dialog={dialog}
          accounts={accounts}
          onClose={() => setDialog(null)}
        />
      )}

      {/* Görsel spec (T6) "yüklendi" iddiasını kaynağa bağlar. */}
      {accountsQuery.data !== undefined && <span hidden data-testid="hp-loaded" />}
    </div>
  );
}

/**
 * Diyaloğun kip çözümü. Düzenlenecek satır listede BULUNAMAZSA form açılmaz ve
 * gerekçesi EKRANDA görünür — boş bir "Yeni Hesap" formu açmak, kullanıcının
 * düzenlediğini sandığı hesabın yerine ikinci bir kayıt yaratmasına yol açardı.
 */
function ChartAccountDialogHost({
  dialog,
  accounts,
  onClose,
}: {
  dialog: ChartAccountDialogState;
  accounts: readonly ChartAccountResponse[] | undefined;
  onClose: () => void;
}) {
  if (dialog.mode === "create") return <ChartAccountFormModal onClose={onClose} />;
  const account = accounts?.find((candidate) => candidate.id === dialog.accountId);
  if (account === undefined) {
    return (
      <p className="mu-notice mu-notice--danger" role="status" data-testid="hp-dialog-missing">
        Hesap listede bulunamadı; listeyi tazeleyin.{" "}
        <button type="button" className="mu-period__nav" data-testid="hp-dialog-close" onClick={onClose}>
          Kapat
        </button>
      </p>
    );
  }
  return <ChartAccountFormModal account={account} onClose={onClose} />;
}
