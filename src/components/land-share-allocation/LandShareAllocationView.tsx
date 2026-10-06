"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { maskesiz } from "@/lib/masked";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Checkbox } from "@/components/ui";
import { UnitFormTabs } from "@/components/unit-shell/UnitFormTabs";
import { SALES_LIST_HREF } from "@/components/unit-shell/routes";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  LAND_SHARE_UNITS_PAGE_SIZE,
  isLandShareMissing,
  useLandShareSummary,
  useLandShareUnits,
  useUpdateAllocation,
} from "@/lib/api/hooks/useLandShare";
import { useProjectBlocks, type BlockResponse } from "@/lib/api/hooks/useProjectBlocks";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { isForbidden } from "@/lib/api/unwrap";
import { SALES_LAND_SHARE_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import {
  assignSelected,
  assignUnit,
  clearPendingUnits,
  clearUnitSelection,
  emptyAllocationState,
  selectAllUnits,
  setUnitShareholder,
  toggleUnitSelection,
  type AllocationState,
  type LandShareUnitRow,
  type UnitOwnerSide,
} from "./allocation-state";
import { autoDistribute } from "./auto-distribute";
import { buildAllocationBody, hasAllocationChanges } from "./build-body";
import {
  ALLOCATION_ATOMIC_HINT,
  ALLOCATION_CANCEL_HREF,
  ALLOCATION_CANCEL_LABEL,
  ALLOCATION_FORBIDDEN_MESSAGE,
  ALLOCATION_FORM_SUBTITLE,
  ALLOCATION_FORM_TITLE,
  ALLOCATION_NO_CHANGES_MESSAGE,
  ALLOCATION_NO_CONTRACT_MESSAGE,
  ALLOCATION_PDF_LABEL,
  ALLOCATION_PDF_PENDING_REASON,
  ALLOCATION_PROJECT_REQUIRED_MESSAGE,
  ALLOCATION_SAVE_ERROR_FALLBACK,
  ALLOCATION_SUBMIT_LABEL,
  ALLOCATION_SUMMARY_ERROR_FALLBACK,
  ALLOCATION_SUMMARY_LOADING,
  ALLOCATION_UNITS_EMPTY,
  ALLOCATION_UNITS_ERROR_FALLBACK,
} from "./constants";
import { applySavedAllocation, savedAllocationFromResponse, type SavedAllocationMap } from "./saved-rows";
import { AllocationBalanceCard } from "./AllocationBalanceCard";
import { AllocationBulkBar } from "./AllocationBulkBar";
import { AllocationTargetCard } from "./AllocationTargetCard";
import { AllocationUnitsCard, type AllocationRowFilter } from "./AllocationUnitsCard";
import { PROJECT_PARAM } from "@/lib/navigation-params";
// Sıra önemli: ortak kabuk → aile ortağı → forma özgü bloklar.
import "@/styles/form-shell.css";
import "@/components/unit-shell/unit-shell.css";
import "./land-share-allocation.css";

/** PG 112 mockup'ta AKTİF çizilen sekmedir — bu ekranın işi atanmayanları atamaktır. */
const DEFAULT_FILTER: AllocationRowFilter = "unassigned";

/**
 * PG — "Kat Karşılığı Paylaşım Girişi" formu (`Form - Paylasim Girisi.dc.html`,
 * kanonik). Yorumlardaki sayılar O DOSYANIN satır numaralarıdır.
 *
 * ⚠️ TAM SAYFA, MODAL DEĞİL: mockup kendi breadcrumb'ını (36), yapışkan üst
 * barını (31-42) ve beş sekmelik şeridini (47-53) çizer; "İptal" (37/275) bir
 * `<a href>`, yani GEZİNMEDİR.
 *
 * ⚠️ İZİN AYRIMI: ünite uçlarının kapısı `projects` modülüdür (`sales` DEĞİL).
 *
 * 🔴 BU EKRANIN ASIL YÜZEYİ FORM ALANLARI DEĞİL, SATIR BAŞINA ATAMADIR.
 * `.lbl` etiketli üç kutunun ÜÇÜ DE gövdeye girmez: proje PATH parametresi,
 * sözleşme SALT OKUNUR, blok bir SÜZGEÇ. Gövde (`UnitAllocationRequest`)
 * yalnız tablodan doğar.
 *
 * 🔴 UÇ ATOMİKTİR: *"tek satir bile reddedilirse hicbiri yazilmaz"*. Bu yüzden
 * gövde YALNIZ gerçekten değişen satırları taşır (`build-body.ts`) ve hata
 * hâlinde ekran "bir kısmı kaydedildi" DEMEZ — tablo sunucudaki hâlinde kalır.
 *
 * 🔴 KAYITTAN SONRA İKİNCİ GET ATILMAZ: `PATCH` yanıtı güncel tam listedir ve
 * tablo ondan yeniden çizilir (`saved-rows.ts`). Yalnız ÖZET yeniden çekilir —
 * denge sayıları yanıtta yoktur.
 *
 * 🔴 KAT KARŞILIĞI OLMAYAN PROJE 404 ALIR, BOŞ ÖZET DEĞİL. Bu ekran o 404'ü
 * bir hata gibi değil, AÇIKLAYICI BOŞ HÂL gibi basar: boş özet "%0/%0
 * paylaşım" yazdırır ve kullanıcı veriyi kaybettiğini sanırdı.
 */
export function LandShareAllocationView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // IZN-F2.x · blok/ünite/toplu/Excel/paylaşım yazma kapısı = mali.satis_* Düzenler (VEYA).
  const canEdit = useButtonGate({ pages: SALES_LAND_SHARE_EDIT, need: "edit" });

  const [projectId, setProjectId] = useState("");
  const [blockId, setBlockId] = useState("");
  const [filter, setFilter] = useState<AllocationRowFilter>(DEFAULT_FILTER);
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<AllocationState>(() => emptyAllocationState());
  const [bulkShareholderId, setBulkShareholderId] = useState("");
  const [autoNotices, setAutoNotices] = useState<readonly string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedAllocationMap>(() => new Map());

  const projectsQuery = useProjects();
  const blocksQuery = useProjectBlocks(projectId);
  const summaryQuery = useLandShareSummary(projectId);
  const unitsQuery = useLandShareUnits(projectId, {
    // "Tümü" bir enum üyesi DEĞİL, süzgecin HİÇ gönderilmemesidir.
    ...(filter === "all" ? {} : { ownerSide: filter }),
    ...(blockId === "" ? {} : { blockId }),
    offset,
  });
  const updateAllocation = useUpdateAllocation();

  // `?proje=` tohumlaması — YALNIZ BİR KEZ (`UnitCreateView`/TU/EI deseni).
  const projectSeededRef = useRef(false);
  useEffect(() => {
    if (projectSeededRef.current) return;
    projectSeededRef.current = true;
    const projeParam = searchParams.get(PROJECT_PARAM);
    if (projeParam) setProjectId(projeParam);
  }, [searchParams]);

  const blocks = useMemo<readonly BlockResponse[]>(
    () => blocksQuery.data?.blocks ?? [],
    [blocksQuery.data],
  );

  // 🔴 SUNUCUNUN YAZDIĞI PAYLAŞIM, SORGUNUN SATIRLARININ ÜZERİNE BİNER.
  // İkinci bir GET yerine `PATCH` cevabı kullanılır (`saved-rows.ts`).
  const rows = useMemo(
    () => applySavedAllocation(unitsQuery.data?.items ?? [], saved),
    [unitsQuery.data, saved],
  );

  // SEKME-F1.3-FIX O5 · `hasAllocationChanges(rows, state)` bilinçli olarak
  // yalnız GÖRÜNEN sayfanın satırlarına bakar (kaydet düğmesi ve `build-body.ts`
  // kural 4 için DOĞRU kapsam — PATCH atomik olduğundan listede olmayan bir
  // `unit_id` tüm isteği 404'e düşürür). Ama üst çubuğun sekme onayı bunu
  // GÖRÜNEN sayfayla sınırlı sanırsa, başka sayfada bırakılmış bekleyen
  // atamaları görmeden "temiz" der (sessiz veri kaybı). `state.pending`
  // sayfalar/süzgeçler arası TÜM bekleyen atamaları taşıdığı için kayda giden
  // ifade doğrudan onun boş olup olmadığına bakar — kaydet düğmesinin kapsamı
  // DEĞİŞMEZ (`hasChanges` aşağıda hâlâ `hasAllocationChanges(rows, state)`).
  useUnsavedChanges(state.pending.size > 0, "Hisse dağıtımı");

  if (!canEdit) return <AccessDenied />;

  const summary = summaryQuery.data ?? null;
  const contract = summary?.contract ?? null;
  const countBalance = summary?.balance.count_balance ?? null;
  const valueBalance = summary?.balance.value_balance ?? null;
  const shareholders = summary?.shareholders ?? [];

  const isSaving = updateAllocation.isPending;
  const hasChanges = hasAllocationChanges(rows, state);

  /**
   * Özetin GÖRÜNÜR gerekçesi. 🔴 404 ile 403 ile "gerçek hata" ÜÇ AYRI
   * cümledir: 404 "bu projede kat karşılığı yok" (boş hâl), 403 "yetki yok",
   * geri kalanı sunucunun kendi gövdesi.
   */
  const summaryNotice = summaryQuery.isError
    ? isLandShareMissing(summaryQuery.error)
      ? ALLOCATION_NO_CONTRACT_MESSAGE
      : isForbidden(summaryQuery.error)
        ? ALLOCATION_FORBIDDEN_MESSAGE
        : backendErrorMessage(summaryQuery.error, ALLOCATION_SUMMARY_ERROR_FALLBACK)
    : projectId === ""
      ? ALLOCATION_PROJECT_REQUIRED_MESSAGE
      : summaryQuery.isLoading
        ? ALLOCATION_SUMMARY_LOADING
        : null;

  // Liste ucu ÖZETLE AYNI 404'ü verir (`_land_share_project`); o mesaj zaten
  // hedef kartında basıldığı için burada TEKRARLANMAZ.
  const unitsError = unitsQuery.isError
    ? isLandShareMissing(unitsQuery.error) || isForbidden(unitsQuery.error)
      ? null
      : backendErrorMessage(unitsQuery.error, ALLOCATION_UNITS_ERROR_FALLBACK)
    : null;

  const total = unitsQuery.data?.total ?? 0;
  const limit = unitsQuery.data?.limit ?? LAND_SHARE_UNITS_PAGE_SIZE;
  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  /** Süzgeç rozetleri ÖZETTEN gelir — sayfadaki satırlardan DEĞİL. */
  const filterCounts = {
    all: countBalance?.total_unit_count ?? null,
    unassigned: countBalance?.unassigned_count ?? null,
    contractor: countBalance?.our_assigned_count ?? null,
    landowner: countBalance?.owner_assigned_count ?? null,
  };

  /**
   * Yeni bir GET'i tetikleyen her değişiklikte SEÇİM boşaltılır: görünmeyen
   * satırlar üzerinde toplu işlem yapmak kullanıcının GÖRMEDİĞİ satırları
   * değiştirirdi. Bekleyen ATAMALAR korunur — kullanıcı sayfaya geri
   * döndüğünde yaptığı işi kaybetmemeli (gövde zaten yalnız GÖRÜNEN
   * satırlardan kurulur, `build-body.ts` kural 4).
   */
  function resetSelection() {
    setState((prev) => clearUnitSelection(prev));
    setBulkShareholderId("");
    setAutoNotices([]);
    // M5_1 kayıt #139: blok/süzgeç/sayfa değişince eski hata banner'ı da
    // temizlenmeli — eskiden yalnız `handleChangeProject` bunu yapıyordu,
    // diğer üç çağıran (block/filter/page) bayat hatayı ekranda bırakıyordu.
    setFormError(null);
  }

  function handleChangeProject(nextProjectId: string) {
    // Proje değişince blok süzgeci, sayfa, seçim VE bekleyen atamalar
    // geçersizleşir: bekleyenler BAŞKA bir projenin ünitelerine aitti ve
    // gönderilirlerse ATOMİK istek 404'e düşerdi (IDOR-8).
    setProjectId(nextProjectId);
    setBlockId("");
    setOffset(0);
    setState(emptyAllocationState());
    setSaved(new Map());
    setFormError(null);
    setBulkShareholderId("");
    setAutoNotices([]);
    const params = new URLSearchParams(searchParams.toString());
    if (nextProjectId) params.set(PROJECT_PARAM, nextProjectId);
    else params.delete(PROJECT_PARAM);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  function handleChangeBlock(nextBlockId: string) {
    setBlockId(nextBlockId);
    setOffset(0);
    resetSelection();
  }

  function handleChangeFilter(nextFilter: AllocationRowFilter) {
    setFilter(nextFilter);
    setOffset(0);
    resetSelection();
  }

  function handleChangePage(nextPage: number) {
    setOffset(Math.max(0, (nextPage - 1) * limit));
    resetSelection();
  }

  /** PG 109 — görünen satırların hepsini seçer; ikinci tıklama BOŞALTIR. */
  function handleToggleAll() {
    setState((prev) =>
      rows.every((row) => prev.selected.has(row.unit_id)) && rows.length > 0
        ? clearUnitSelection(prev)
        : selectAllUnits(prev, rows),
    );
  }

  function handleToggleRow(row: LandShareUnitRow) {
    setState((prev) => toggleUnitSelection(prev, row.unit_id));
  }

  function handleAssignRow(row: LandShareUnitRow, side: UnitOwnerSide | null) {
    setState((prev) => assignUnit(prev, row, side));
    setFormError(null);
  }

  /** PG 92/93 — seçili satırların tamamı. GUARD 10: BİZ ataması hissedarı TEMİZLER. */
  function handleAssignSelected(side: UnitOwnerSide) {
    setState((prev) => assignSelected(prev, rows, side));
    setFormError(null);
  }

  /**
   * PG 95-100 — toplu hissedar. `setUnitShareholder` (T1) ARSA'da OLMAYAN
   * satırı DEĞİŞTİRMEDEN geri döndürür, yani bu düğmeden sunucunun 422'sini
   * (ve ATOMİK uç yüzünden TÜM kaydın düşmesini) tetiklemek mümkün değildir.
   */
  function handleAssignShareholder(nextShareholderId: string) {
    setBulkShareholderId(nextShareholderId);
    if (nextShareholderId === "") return;
    setState((prev) =>
      rows
        .filter((row) => prev.selected.has(row.unit_id))
        .reduce((acc, row) => setUnitShareholder(acc, row, nextShareholderId), prev),
    );
    setFormError(null);
  }

  function handleChangeRowShareholder(row: LandShareUnitRow, nextShareholderId: string | null) {
    setState((prev) => setUnitShareholder(prev, row, nextShareholderId));
    setFormError(null);
  }

  /**
   * PG 101 — 🔴 SUNUCUYA HİÇBİR ŞEY GÖNDERMEZ. Böyle bir uç yoktur; işlem
   * yalnız BEKLEYEN atama üretir ve gerekçelerini görünür kılar.
   */
  function handleAutoDistribute() {
    if (contract === null || countBalance === null || valueBalance === null) return;
    const result = autoDistribute({
      rows,
      state,
      ourSharePct: contract.our_share_pct,
      // 🔴 HEDEF ADETLER SUNUCUDAN: istemci `Math.round(total * pct)` yazsaydı
      // 42 üniteyi 23+20=43 yapan ikinci bir hesap doğardı.
      ourExpectedCount: countBalance.our_expected_count,
      ownerExpectedCount: countBalance.owner_expected_count,
      // 🔴 ZATEN ATANMIŞ ADET/DEĞER DE SUNUCUDAN: süzgeç (varsayılanı
      // "Atanmayan") ve sayfalama listeyi daraltır, ÖZETİ DARALTMAZ. Sayaçlar
      // görünen satırlardan doldurulsaydı kalan kapasite TÜM hedef sanılır ve
      // dağıtım aşırı atama üretirdi.
      ourAssignedCount: countBalance.our_assigned_count,
      ownerAssignedCount: countBalance.owner_assigned_count,
      ourAssignedValue: maskesiz(valueBalance.our_value, "our_value"),
      ownerAssignedValue: maskesiz(valueBalance.owner_value, "owner_value"),
    });
    setState(result.state);
    setAutoNotices(result.notices);
    setFormError(null);
  }

  /** PG 276 — tek yazma. Gövde `build-body.ts`ten gelir; burada KURULMAZ. */
  async function handleSubmit() {
    if (projectId === "") {
      setFormError(ALLOCATION_PROJECT_REQUIRED_MESSAGE);
      return;
    }
    if (!hasChanges) {
      setFormError(ALLOCATION_NO_CHANGES_MESSAGE);
      return;
    }
    setFormError(null);
    const body = buildAllocationBody(rows, state);
    try {
      const response = await updateAllocation.mutateAsync({ projectId, body });
      // 🔴 Cevap GÜNCEL TAM LİSTEDİR → tablo ondan çizilir, ikinci GET yok.
      setSaved(savedAllocationFromResponse(response));
      // 🔴 YALNIZ GÖNDERİLENLER temizlenir: gövde GÖRÜNEN satırlardan kurulur
      // (`build-body.ts` kural 4), `pending`i büsbütün boşaltmak başka
      // sayfadaki — HİÇ GÖNDERİLMEMİŞ — atamaları sessizce yok ederdi.
      setState((prev) => clearPendingUnits(prev, body.items.map((item) => item.unit_id)));
      setBulkShareholderId("");
      setAutoNotices([]);
    } catch (error) {
      // 🔴 ATOMİK: 404/422 hâlinde HİÇBİR satır yazılmadı. Sunucu gövdesi bunu
      // söylemez; cümle eklenmezse kullanıcı kısmi yazma sanır ve tabloyu
      // yanlış okur. Bekleyen atamalar KORUNUR — kullanıcı düzeltip yeniden
      // deneyebilsin diye.
      setFormError(
        `${backendErrorMessage(error, ALLOCATION_SAVE_ERROR_FALLBACK)} ${ALLOCATION_ATOMIC_HINT}`,
      );
    }
  }

  return (
    <div className="pf-shell">
      {/* 31-42 — kabuk canonuna oturtulmuş üst şerit */}
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          <Link href={SALES_LIST_HREF}>Satış Yönetimi</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="pf-breadcrumb__current" aria-current="page">
            {ALLOCATION_FORM_TITLE}
          </span>
        </nav>
        <div className="pf-topbar__actions">
          {/* 37 — mockup'ta `<a href>`: GEZİNME, eylem değil */}
          <Link
            href={ALLOCATION_CANCEL_HREF}
            className="btn btn--secondary btn--md pf-topbar-cancel"
            data-testid="paylasim-form-iptal-ust"
          >
            {ALLOCATION_CANCEL_LABEL}
          </Link>
          <Button
            variant="success"
            className="pf-topbar-submit"
            data-testid="paylasim-form-kaydet-ust"
            onClick={handleSubmit}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? "Kaydediliyor…" : ALLOCATION_SUBMIT_LABEL}
          </Button>
        </div>
      </div>

      <div className="pf pg-page">
        {/* 47-53 */}
        <UnitFormTabs activeTab="Paylaşım Girişi" />

        <header className="pf-head">
          <h1 className="pf-title">{ALLOCATION_FORM_TITLE}</h1>
          <p className="pf-subtitle">{ALLOCATION_FORM_SUBTITLE}</p>
        </header>

        <div className="pf-body" data-testid="paylasim-form-govde">
          <AllocationTargetCard
            projects={projectsQuery.data?.items ?? []}
            projectId={projectId}
            projectsDisabled={projectsQuery.isLoading || projectsQuery.isError}
            blocks={blocks}
            blockId={blockId}
            blocksDisabled={blocksQuery.isLoading || blocksQuery.isError}
            contract={contract}
            countBalance={countBalance}
            notice={summaryNotice}
            onChangeProject={handleChangeProject}
            onChangeBlock={handleChangeBlock}
          />

          <AllocationBulkBar
            selectedCount={state.selected.size}
            shareholders={shareholders}
            shareholderId={bulkShareholderId}
            ourSharePct={contract?.our_share_pct ?? null}
            ownerSharePct={contract?.owner_share_pct ?? null}
            disabled={isSaving}
            notices={autoNotices}
            onAssign={handleAssignSelected}
            onAssignShareholder={handleAssignShareholder}
            onAutoDistribute={handleAutoDistribute}
          />

          <AllocationUnitsCard
            rows={rows}
            state={state}
            filter={filter}
            counts={filterCounts}
            shareholders={shareholders}
            isLoading={unitsQuery.isLoading && projectId !== ""}
            errorMessage={unitsError}
            emptyNotice={ALLOCATION_UNITS_EMPTY}
            disabled={isSaving}
            page={page}
            pageCount={pageCount}
            onChangeFilter={handleChangeFilter}
            onToggleAll={handleToggleAll}
            onToggleRow={handleToggleRow}
            onAssignRow={handleAssignRow}
            onChangeRowShareholder={handleChangeRowShareholder}
            onChangePage={handleChangePage}
          />

          {contract && countBalance && valueBalance && (
            <AllocationBalanceCard
              contract={contract}
              countBalance={countBalance}
              valueBalance={valueBalance}
            />
          )}
        </div>

        {formError && (
          <p className="pf-form-error" data-testid="paylasim-form-hata">
            {formError}
          </p>
        )}

        {/* 269-278 — alt eylem şeridi (iki uca yaslı) */}
        <div className="pf-actions pf-actions--split">
          {/* 270-272 — 🔴 SUNUCUDA KARŞILIĞI YOK: kutu SİLİNMEZ, devre dışı +
              İŞARETSİZ + GÖRÜNÜR gerekçe. Mockup kutuyu `checked` çizer;
              işaretli basmak arkasında hiçbir şey olmayan bir sözü tutuyormuş
              gibi görünmek olurdu. `allocation-state.ts`te alanı OLMADIĞI için
              gövdeye sızması yapısal olarak imkânsızdır. */}
          <span className="pg-pdf">
            <Checkbox
              size="lg"
              disabled
              checked={false}
              readOnly
              data-testid="paylasim-form-pdf"
              label={ALLOCATION_PDF_LABEL}
            />
            <span className="uf-pending-reason">{ALLOCATION_PDF_PENDING_REASON}</span>
          </span>

          <div className="pf-actions__group">
            {/* Kaydedilecek bir şey yokken düğme kapalıdır ve SEBEBİ GÖRÜNÜR:
                `items` sunucuda `min_length=1`dir, boş liste 422 üretirdi. */}
            {!hasChanges && (
              <span className="uf-pending-reason" data-testid="paylasim-form-degisiklik-yok">
                {ALLOCATION_NO_CHANGES_MESSAGE}
              </span>
            )}
            <Link
              href={ALLOCATION_CANCEL_HREF}
              className="btn btn--secondary btn--md pf-action pf-action--cancel"
              data-testid="paylasim-form-iptal"
            >
              {ALLOCATION_CANCEL_LABEL}
            </Link>
            <Button
              variant="success"
              className="pf-action pf-action--submit"
              data-testid="paylasim-form-kaydet"
              onClick={handleSubmit}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? "Kaydediliyor…" : ALLOCATION_SUBMIT_LABEL}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
