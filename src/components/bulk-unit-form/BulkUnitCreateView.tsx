"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { UnitFormTabs } from "@/components/unit-shell/UnitFormTabs";
import { SALES_LIST_HREF } from "@/components/unit-shell/routes";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useProjectBlocks, type BlockResponse } from "@/lib/api/hooks/useProjectBlocks";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import {
  useBulkUnitPreview,
  useCreateBulkUnits,
  type UnitBulkPreview,
} from "@/lib/api/hooks/useUnitBulk";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { SALES_BULK_UNIT_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { parseCountInput } from "@/lib/decimal";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { buildBulkUnitBody } from "./build-body";
import {
  BULK_BLOCK_REQUIRED_MESSAGE,
  BULK_CANCEL_LABEL,
  BULK_CONFLICT_HINT,
  BULK_FORM_SUBTITLE,
  BULK_FORM_TITLE,
  BULK_NO_PROJECT_BLOCK_NOTICE,
  BULK_PREVIEW_ERROR_FALLBACK,
  BULK_PREVIEW_LABEL,
  BULK_PREVIEW_STALE_NOTICE,
  BULK_PROJECT_REQUIRED_MESSAGE,
  BULK_SAVE_ERROR_FALLBACK,
  BULK_SLOT_INVALID_MESSAGE,
  BULK_WARNING_TEXT,
  bulkSubmitLabel,
} from "./constants";
import { deriveBulkTotal } from "./derive";
import { deriveFloorRange, parseFloorValue, resolveEndFloor } from "./floor-range";
import {
  emptyBulkUnitFormValues,
  setBulkUnitField,
  setUnitsPerFloor,
  type BulkUnitFormValues,
} from "./form-state";
import { hasSlotErrors, setSlotField, type BulkSlotField, type BulkSlotValues } from "./slots";
import { BulkPreviewCard } from "./BulkPreviewCard";
import { BulkRulesCard } from "./BulkRulesCard";
import { BulkSlotTemplateCard } from "./BulkSlotTemplateCard";
import { BulkTargetBlockCard } from "./BulkTargetBlockCard";
import { PROJECT_PARAM, BLOCK_PARAM } from "@/lib/navigation-params";
// Sıra önemli: ortak kabuk → aile ortağı → forma özgü bloklar.
import "@/styles/form-shell.css";
import "@/components/unit-shell/unit-shell.css";
import "./bulk-unit-form.css";

/** `POST …/units/bulk`ın HEP-YA-HİÇ reddi. */
const CONFLICT_STATUS = 409;

/**
 * TU — "Toplu Ünite Üretimi" formu (`Form - Toplu Unite.dc.html`, kanonik).
 * Yorumlardaki sayılar O DOSYANIN satır numaralarıdır.
 *
 * ⚠️ TAM SAYFA, MODAL DEĞİL: mockup kendi breadcrumb'ını (36), yapışkan üst
 * barını (31-42) ve beş sekmelik şeridini (47-53) çizer; "İptal" (39/181) bir
 * `<a href>`, yani GEZİNMEDİR.
 *
 * ⚠️ Kabuk canonu: mockup'ın kendi üst barı ve sol menüsü BASILMAZ; üst
 * bardaki İKİ eylem kabuğa oturur (`UnitCreateView` emsali).
 *
 * ⚠️ İZİN AYRIMI: ünite uçlarının kapısı `projects` modülüdür (`sales` DEĞİL).
 *
 * ⚠️ ŞANTİYE SÜZGECİ (62) GÖVDEYE GİRMEZ: blok listesini istemcide daraltır.
 * `BlockResponse` her satırda `site_id` taşıdığı için ikinci bir istek AÇILMAZ.
 * 🔴 EI (Excel içe aktarma) ile karıştırılmamalıdır — orada `site_id` GERÇEK
 * bir gövde alanıdır.
 *
 * 🔴 İKİ UCUN ANLAMI AYRIDIR ve ekran bunu görünür kılar:
 *   · TU 182 "Önizlemeyi Yenile" → `…/units/bulk/preview`, **hiçbir şey
 *     yazmaz, denetim üretmez**; çakışan satırlar 200 ile UYARI olarak döner.
 *   · TU 40/183 "N Üniteyi Oluştur" → `…/units/bulk`, **hep-ya-hiç**; tek
 *     numara bile çakışırsa 409 döner ve HİÇBİRİ yazılmaz.
 *
 * 🔴 ÖNİZLEME FORM DEĞİŞİNCE ATILIR. Sunucu `POST …/units/bulk`ta önizlemeden
 * gelen satırları KABUL ETMEZ, aynı girdiden YENİDEN üretir; ekranda eski bir
 * tabloyu tutmak kullanıcıya gördüğünden BAŞKA bir şeyi kaydettirirdi
 * (`bulk.py`: *"kullanici onizlemede gordugunden BASKA bir sey kaydeder ve
 * bunu fark edemezdi"*).
 */
export function BulkUnitCreateView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const permission = useModulePermission("projects");
  // IZN-F2.x · toplu üretim yazma kapısı = mali.satis_* Düzenler (VEYA).
  const canEdit = useButtonGate({ pages: SALES_BULK_UNIT_EDIT, need: "edit", fallback: hasAtLeast(permission.level, "full") });

  const [values, setValues] = useState<BulkUnitFormValues>(() => emptyBulkUnitFormValues());
  // SEKME-F1.6-Y1 — taban artık anlık görüntü DEĞİL, `StockEntryForm`
  // deseniyle AYRI durum (`[baseline, setBaseline]`): `?proje=&blok=` tohumu
  // tabanı da kaydırır (aşağıdaki efekt), yoksa form açılır açılmaz
  // `isDirty=true` doğardı — kullanıcı hiçbir şey yapmadan "kaydedilmemiş
  // değişiklik" uyarısı görürdü. ÖNİZLEME (`preview`) BİLEREK dışarıda
  // tutulur (envanter uyarısı): önizleme "yenile" tıklamak kullanıcı girdisi
  // kaybettirmez, formu değiştirmez.
  const [baseline, setBaseline] = useState<BulkUnitFormValues>(values);
  const isDirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const [preview, setPreview] = useState<UnitBulkPreview | null>(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const projectsQuery = useProjects();
  const sitesQuery = useSites(values.projectId);
  const blocksQuery = useProjectBlocks(values.projectId);
  const previewMutation = useBulkUnitPreview();
  const createBulk = useCreateBulkUnits();

  // `?proje=` + `?blok=` tohumlaması — YALNIZ BİR KEZ (`UnitCreateView` deseni).
  // 🔴 `BLOCK_PARAM` BE 109'un ("Kaydettikten sonra toplu ünite üretimine geç")
  // getirdiği blok bağlamıdır: `BlockCreateView` kayıttan sonra
  // `?proje=…&blok=<yeni blok>` ile buraya yönlendirir; OKUNMAZSA kullanıcı blok
  // seçicisi BOŞ bir ekrana düşer ve o kutucuk süsten ibaret kalırdı. İki anahtar
  // da `@/lib/navigation-params`ten gelir — üretici ile tüketici AYNI sabiti paylaşır.
  // Tek `useRef` ikisini birlikte korur: ayrı bayraklar, kullanıcı seçimi
  // değiştirdikten sonra URL güncellenince tohumu YENİDEN uygulayabilirdi.
  //
  // SEKME-F1.6-Y1 — `setValues` VE `setBaseline` AYNI dönüşümle, birlikte
  // çağrılır ("otomatik URL tohumu asla kullanıcı kirletti SAYILMAZ"):
  // yalnız `values` kaydırılsaydı taban geride kalır ve form açılır açılmaz
  // `isDirty=true` doğardı (gerçek yol: `BlockCreateView` → burası).
  const contextSeededRef = useRef(false);
  useEffect(() => {
    if (contextSeededRef.current) return;
    contextSeededRef.current = true;
    const projeParam = searchParams.get(PROJECT_PARAM);
    const blokParam = searchParams.get(BLOCK_PARAM);
    if (!projeParam && !blokParam) return;
    const applySeed = (prev: BulkUnitFormValues): BulkUnitFormValues => ({
      ...prev,
      ...(projeParam ? { projectId: projeParam } : {}),
      // Blok listesi projeye bağlıdır; blok tek başına gelirse de yazılır ve
      // liste geldiğinde seçici o bloğa oturur.
      ...(blokParam ? { blockId: blokParam } : {}),
    });
    setValues(applySeed);
    setBaseline(applySeed);
  }, [searchParams]);

  const projects = projectsQuery.data?.items ?? [];
  const sites = sitesQuery.data?.items ?? [];
  const allBlocks = useMemo<readonly BlockResponse[]>(
    () => blocksQuery.data?.blocks ?? [],
    [blocksQuery.data],
  );

  // 62 — şantiye YALNIZ süzgeçtir; seçim yoksa liste daralmaz.
  const blocks = useMemo(
    () =>
      values.siteId === ""
        ? allBlocks
        : allBlocks.filter((block) => block.site_id === values.siteId),
    [allBlocks, values.siteId],
  );

  const selectedBlock = useMemo(
    () => allBlocks.find((block) => block.id === values.blockId) ?? null,
    [allBlocks, values.blockId],
  );

  // 70/71 — kat listesi SEÇİLİ BLOKTAN türer; mockup'ın sabit listesi kullanılmaz.
  const range = useMemo(() => deriveFloorRange(selectedBlock), [selectedBlock]);

  // 73 — sunucu formülüyle BİREBİR türev (`derive.ts`).
  const total = useMemo(() => {
    const end = resolveEndFloor(values.endFloor, range);
    return deriveBulkTotal({
      startFloor: parseFloorValue(values.startFloor),
      endFloor: end.endFloor,
      roofFloor: end.roofFloor,
      unitsPerFloor: parseCountInput(values.unitsPerFloor),
    });
  }, [values.startFloor, values.endFloor, values.unitsPerFloor, range]);

  // SEKME-F1.3b — hook, erken dönüşten ÖNCE (Rules of Hooks).
  useUnsavedChanges(isDirty, "Toplu ünite formu");

  if (!canEdit) return <AccessDenied />;

  const isPreviewing = previewMutation.isPending;
  const isSaving = createBulk.isPending;
  const isBusy = isPreviewing || isSaving;

  const blocksNotice = blocksQuery.isError
    ? isForbidden(blocksQuery.error)
      ? "Blok listesi için proje yetkisi gerekiyor."
      : backendErrorMessage(blocksQuery.error, "Blok listesi yüklenemedi.")
    : values.projectId === ""
      ? BULK_NO_PROJECT_BLOCK_NOTICE
      : null;

  /**
   * Kurallar değiştiğinde önizleme ARTIK GEÇERLİ DEĞİLDİR. Eski tabloyu
   * ekranda tutmak, kullanıcıya kaydedeceğinden başka bir sonucu gösterirdi.
   */
  function invalidatePreview() {
    setPreviewStale(preview !== null);
    setPreview(null);
    setPreviewError(null);
  }

  function handleChangeField<K extends keyof BulkUnitFormValues>(
    field: K,
    value: BulkUnitFormValues[K],
  ) {
    setValues((prev) => setBulkUnitField(prev, field, value));
    invalidatePreview();
  }

  /** 72 — alan ve kat şablonu satırları TEK adımda eşitlenir (`form-state.ts`). */
  function handleChangeUnitsPerFloor(raw: string) {
    setValues((prev) => setUnitsPerFloor(prev, raw));
    invalidatePreview();
  }

  function handleChangeSlot<K extends BulkSlotField>(
    index: number,
    field: K,
    value: BulkSlotValues[K],
  ) {
    setValues((prev) => ({ ...prev, slots: setSlotField(prev.slots, index, field, value) }));
    invalidatePreview();
  }

  function handleChangeProject(projectId: string) {
    // Proje değişince şantiye VE blok seçimi geçersizleşir; kat aralığı da
    // bloğa bağlıdır (`floor-range.ts`) — dördü birlikte sıfırlanır.
    setValues((prev) => ({
      ...prev,
      projectId,
      siteId: "",
      blockId: "",
      startFloor: "",
      endFloor: "",
    }));
    invalidatePreview();
    const params = new URLSearchParams(searchParams.toString());
    if (projectId) params.set(PROJECT_PARAM, projectId);
    else params.delete(PROJECT_PARAM);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  function handleChangeSite(siteId: string) {
    // Şantiye süzgeci değişince seçili blok listenin dışında kalabilir; blok ve
    // ona bağlı kat aralığı sıfırlanır (görünmeyen bir bloğu göndermemek için).
    setValues((prev) => ({ ...prev, siteId, blockId: "", startFloor: "", endFloor: "" }));
    invalidatePreview();
  }

  function handleChangeBlock(blockId: string) {
    // Kat aralığı BLOKTAN türer: blok değişince eski seçim o blokta OLMAYAN bir
    // katı gösterebilir; sessizce taşımak yerine sıfırlanır.
    setValues((prev) => ({ ...prev, blockId, startFloor: "", endFloor: "" }));
    invalidatePreview();
  }

  /** İki ucun da ortak ön koşulu; sağlanmıyorsa istek KURULMAZ. */
  function missingTargetMessage(): string | null {
    if (values.projectId === "") return BULK_PROJECT_REQUIRED_MESSAGE;
    if (values.blockId === "") return BULK_BLOCK_REQUIRED_MESSAGE;
    return null;
  }

  /**
   * 🔴 KUSUR no 39 + 44 — "gövdeye giremeyen bir alan kullanıcıya GÖRÜNÜR bir
   * hata olarak dönmelidir" kuralı: kat şablonunda geçersiz ondalık VEYA
   * "üst katlarda fiyat artışı" kutucuğu açıkken yüzde boşsa istek hiç
   * KURULMAZ — sessizce eksik gövde gönderilmez.
   */
  function invalidFieldsMessage(): string | null {
    if (hasSlotErrors(values.slots)) return BULK_SLOT_INVALID_MESSAGE;
    // Fiyat artışı yüzdesi BOŞSA akış ENGELLENMEZ (kullanıcı kararı 2026-09-23):
    // boş yüzde = artış yok. Ekranın yalan söylememesi `BulkSlotTemplateCard`ta
    // basılan notla sağlanır, kapıyla değil.
    return null;
  }

  /** 182 — önizleme: HİÇBİR ŞEY YAZMAZ, denetim üretmez.
   *
   * 🔴 `invalidFieldsMessage()` BURADA ÇALIŞMAZ (2026-09-23, e2e kırmızısı):
   * "üst katlarda fiyat artışı" kutucuğu mockup gereği VARSAYILAN İŞARETLİ ve
   * yüzde BOŞ doğar — o kuralı önizlemeye de uygulamak, formu daha kullanıcı
   * hiçbir şey yazmadan KİLİTLİ doğuruyordu (e2e: önizleme tablosu 24 satır
   * yerine 0). Önizleme hiçbir şey YAZMAZ; kural YAZAN yola (`handleSubmit`)
   * aittir. Alan hatası kullanıcıya zaten hücrede görünür.
   */
  async function handlePreview() {
    const missing = missingTargetMessage();
    if (missing !== null) {
      setPreviewError(missing);
      return;
    }
    setPreviewError(null);
    setPreviewStale(false);
    try {
      const result = await previewMutation.mutateAsync({
        projectId: values.projectId,
        body: buildBulkUnitBody(values, range),
      });
      setPreview(result);
    } catch (error) {
      // 422 (aralık/sınır) ve 404 (IDOR-9) gövdeleri OLDUĞU GİBİ basılır.
      setPreview(null);
      setPreviewError(backendErrorMessage(error, BULK_PREVIEW_ERROR_FALLBACK));
    }
  }

  /** 40/183 — gerçek üretim: HEP-YA-HİÇ. */
  async function handleSubmit() {
    const missing = missingTargetMessage() ?? invalidFieldsMessage();
    if (missing !== null) {
      setFormError(missing);
      return;
    }
    setFormError(null);
    try {
      await createBulk.mutateAsync({
        projectId: values.projectId,
        body: buildBulkUnitBody(values, range),
      });
      router.push(SALES_LIST_HREF);
    } catch (error) {
      const detail = backendErrorMessage(error, BULK_SAVE_ERROR_FALLBACK);
      // 🔴 409'un ANLAMI sunucu gövdesinde YOKTUR: `BULK_NUMBERS_TAKEN` yalnız
      // hangi numaraların dolu olduğunu söyler. "Hiçbiri yazılmadı" cümlesi
      // eklenmezse kullanıcı kısmi yazma sanır.
      setFormError(
        error instanceof BackendError && error.status === CONFLICT_STATUS
          ? `${detail} ${BULK_CONFLICT_HINT}`
          : detail,
      );
    }
  }

  // 40/183 — sayı TÜREVDİR; geçersiz bileşimde UYDURULMAZ.
  const submitLabel = bulkSubmitLabel(total.kind === "valid" ? total.total : null);

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
            {BULK_FORM_TITLE}
          </span>
        </nav>
        <div className="pf-topbar__actions">
          {/* 39 — mockup'ta `<a href>`: GEZİNME, eylem değil */}
          <Link
            href={SALES_LIST_HREF}
            className="btn btn--secondary btn--md pf-topbar-cancel"
            data-testid="toplu-form-iptal-ust"
          >
            {BULK_CANCEL_LABEL}
          </Link>
          <Button
            variant="success"
            className="pf-topbar-submit"
            data-testid="toplu-form-olustur-ust"
            onClick={handleSubmit}
            disabled={isBusy}
          >
            {isSaving ? "Oluşturuluyor…" : submitLabel}
          </Button>
        </div>
      </div>

      <div className="pf tu-page">
        {/* 47-53 */}
        <UnitFormTabs activeTab="Toplu Üretim" />

        <header className="pf-head">
          <h1 className="pf-title">{BULK_FORM_TITLE}</h1>
          <p className="pf-subtitle">{BULK_FORM_SUBTITLE}</p>
        </header>

        <div className="pf-body" data-testid="toplu-form-govde">
          <BulkTargetBlockCard
            values={values}
            projects={projects}
            sites={sites}
            blocks={blocks}
            projectsDisabled={projectsQuery.isLoading || projectsQuery.isError}
            sitesDisabled={sitesQuery.isLoading || sitesQuery.isError}
            blocksDisabled={blocksQuery.isLoading || blocksQuery.isError}
            blocksNotice={blocksNotice}
            onChangeProject={handleChangeProject}
            onChangeSite={handleChangeSite}
            onChangeBlock={handleChangeBlock}
          />

          <BulkRulesCard
            values={values}
            range={range}
            total={total}
            onChangeField={handleChangeField}
            onChangeUnitsPerFloor={handleChangeUnitsPerFloor}
          />

          <BulkSlotTemplateCard
            values={values}
            onChangeSlot={handleChangeSlot}
            onChangeField={handleChangeField}
          />

          <BulkPreviewCard
            preview={preview}
            isLoading={isPreviewing}
            errorMessage={previewError}
            emptyNotice={previewStale ? BULK_PREVIEW_STALE_NOTICE : undefined}
          />
        </div>

        {/* 176-178 — dikkat şeridi. `⚠️` VS16'lıdır (glif bekçisi çıplak
            `⚠`ı yasaklar, VS16'lı hâli serbesttir). */}
        <p className="tu-warning" data-testid="toplu-form-uyari">
          <strong>⚠️ Dikkat:</strong> {BULK_WARNING_TEXT}
        </p>

        {formError && (
          <p className="pf-form-error" data-testid="toplu-form-hata">
            {formError}
          </p>
        )}

        {/* 180-184 — alt eylem şeridi (sağa yaslı, üç eylem) */}
        <div className="pf-actions">
          <Link
            href={SALES_LIST_HREF}
            className="btn btn--secondary btn--md pf-action pf-action--cancel"
            data-testid="toplu-form-iptal"
          >
            {BULK_CANCEL_LABEL}
          </Link>
          <Button
            variant="secondary"
            className="pf-action pf-action--draft"
            data-testid="toplu-form-onizle"
            onClick={handlePreview}
            disabled={isBusy}
          >
            {isPreviewing ? "Önizleniyor…" : BULK_PREVIEW_LABEL}
          </Button>
          <Button
            variant="success"
            className="pf-action pf-action--submit"
            data-testid="toplu-form-olustur"
            onClick={handleSubmit}
            disabled={isBusy}
          >
            {isSaving ? "Oluşturuluyor…" : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
