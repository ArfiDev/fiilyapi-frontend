"use client";

import { useState } from "react";
import Link from "next/link";

import { Button, Checkbox } from "@/components/ui";
import { SearchIcon, WarningTriangleIcon } from "@/components/ui/icons";
import { useSession } from "@/components/shell/SessionProvider";
import { Modal } from "./Modal";
import { UserAvatar } from "./primitives/UserAvatar";
import { useEvDisciplines } from "@/lib/api/hooks/useEvDisciplines";
import { useSetUserDisciplines, useUserDisciplines } from "@/lib/api/hooks/useUserDisciplines";
import { backendErrorMessage } from "@/lib/api/error-message";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import type { EvDisciplineRead, UserResponse } from "@/lib/api/models";
import "./discipline-assignment.css";

/**
 * Rol anahtarları (backend `roles/seed_data.py`): "Sistem Yöneticisi" =
 * `system_admin`, "Proje Müdürü" = `project_manager`. Mockup (Kullanıcı
 * Disiplin Ataması.dc.html: Ahmet Yılmaz/Patron `admin:true`) Patron'u da
 * yönetici sayar → `patron` dahil. Spec Ü10: atama kısıtlar, ekran UYARIR,
 * ENGELLEMEZ.
 */
const ADMIN_ROLE_KEYS: ReadonlySet<string> = new Set(["system_admin", "patron", "project_manager"]);

/** Arama çubuğu yalnız bu sayıdan uzun listede görünür (mockup: `list.length > 6`). */
const SEARCH_MIN_ITEMS = 6;

interface DisciplineAssignmentModalProps {
  user: UserResponse;
  /** Kullanıcının rol ANAHTARI (`RoleResponse.key`) — yönetici uyarısı buna bağlıdır. */
  roleKey: string;
  onClose: () => void;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Kaydetme hatası gerekçesi: backend `detail` varsa o, yoksa durum kodlu genel metin. */
function saveFailureReason(err: unknown): string {
  const detail = backendErrorMessage(err, "");
  if (detail) return detail;
  return err instanceof BackendError ? `Sunucu yanıt vermedi (${err.status}).` : "Sunucu yanıt vermedi.";
}

function matchesQuery(discipline: EvDisciplineRead, query: string): boolean {
  return (
    query === "" ||
    discipline.code.toLocaleLowerCase("tr").includes(query) ||
    discipline.name.toLocaleLowerCase("tr").includes(query)
  );
}

export function DisciplineAssignmentModal({ user, roleKey, onClose }: DisciplineAssignmentModalProps) {
  const catalogQuery = useEvDisciplines();
  const assignedQuery = useUserDisciplines(user.id);
  const setDisciplines = useSetUserDisciplines(user.id);
  const { me, refresh } = useSession();

  // `null` = kullanıcı henüz dokunmadı → sunucu verisi gösterilir. Dokunduktan
  // sonra seçim KENDİ durumudur; yeniden getirme (Tekrar dene, odak dönüşü)
  // onu EZMEZ (FORM-EZ dersi: efektle tohumlama yok, türetme var).
  const [selection, setSelection] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const serverIds = assignedQuery.data?.discipline_ids;
  const selected = selection ?? serverIds ?? [];
  const isDirty = selection !== null && serverIds !== undefined && !sameSet(selection, serverIds);
  useUnsavedChanges(isDirty, "Disiplin ataması");

  const catalog = catalogQuery.data;
  const isCatalogForbidden = isForbidden(catalogQuery.error);
  const hasLoadError = !isCatalogForbidden && (catalogQuery.isError || assignedQuery.isError);
  const isSaving = setDisciplines.isPending;
  const isReady = serverIds !== undefined && catalog !== undefined;
  const isEmptyCatalog = catalog !== undefined && catalog.length === 0;

  function toggle(id: string) {
    setSaveError(null);
    setSelection(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  function submit() {
    if (!isDirty || isSaving) return;
    setSaveError(null);
    setDisciplines.mutate(
      { discipline_ids: selected },
      {
        onSuccess: () => {
          // Kendi disiplinini değiştiren yönetici: kabuktaki `me` (avatar menüsü) tazelenir.
          if (me?.id === user.id) void refresh?.();
          onClose();
        },
        onError: (err) => setSaveError(saveFailureReason(err)),
      },
    );
  }

  function retryLoad() {
    if (catalogQuery.isError) void catalogQuery.refetch();
    if (assignedQuery.isError) void assignedQuery.refetch();
  }

  function requestClose() {
    if (isSaving) return;
    if (isConfirmOpen) {
      setConfirmOpen(false);
      return;
    }
    if (isDirty) {
      setConfirmOpen(true);
      return;
    }
    onClose();
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("tr");
  const shown = (catalog ?? []).filter((d) => matchesQuery(d, normalizedQuery));
  const showSearch = (catalog?.length ?? 0) > SEARCH_MIN_ITEMS;
  const isAdminRole = ADMIN_ROLE_KEYS.has(roleKey);

  return (
    <Modal
      title="Disiplin Ataması"
      subtitle={`${user.full_name} · ${user.title}`}
      leading={<UserAvatar roleKey={roleKey} name={user.full_name} />}
      className="dsc-modal"
      onClose={requestClose}
      footer={
        <>
          <span className={cx("dsc-summary", selected.length === 0 && "dsc-summary--none")}>
            <span className="dsc-summary__dot" aria-hidden="true" />
            {selected.length > 0 ? `${selected.length} disiplinle sınırlı` : "Kısıtsız — tüm disiplinleri görür"}
          </span>
          <Button variant="secondary" onClick={requestClose} disabled={isSaving}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={submit} disabled={!isDirty || isSaving}>
            {isSaving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </>
      }
    >
      <div className="dsc-info">
        <span className="dsc-info__mark" aria-hidden="true">
          i
        </span>
        <span>
          Disiplin atanan kullanıcı yalnız bu disiplinlerin iş kalemlerini görür ve girer. Hiç disiplin seçilmezse
          kullanıcı kısıtsızdır.
        </span>
      </div>

      {catalogQuery.isLoading && <p className="settings-note">Yükleniyor…</p>}

      {isCatalogForbidden && (
        // Savunma dalı (mockup'ta YOK): B0b sonrası `GET /earned-value/disciplines` `user_management:view`
        // ile de açık; bu mesaj yalnız kullanıcının izin satırı bozuksa görünür.
        <p className="settings-note settings-note--error">Disiplin listesini görme yetkiniz yok.</p>
      )}

      {hasLoadError && (
        <div className="dsc-banner dsc-banner--error" role="alert">
          <WarningTriangleIcon width={14} height={14} aria-hidden="true" />
          <span className="dsc-banner__text">Disiplinler yüklenemedi.</span>
          <button type="button" className="dsc-banner__retry" onClick={retryLoad}>
            Tekrar dene
          </button>
        </div>
      )}

      {catalog !== undefined && catalog.length > 0 && (
        <>
          {showSearch && (
            <div className="dsc-search">
              <SearchIcon width={13} height={13} aria-hidden="true" />
              <input
                type="search"
                value={query}
                placeholder="Disiplin ara (kod ya da ad)"
                aria-label="Disiplin ara"
                onChange={(event) => setQuery(event.target.value)}
              />
              <span className="dsc-search__count">
                {selected.length} / {catalog.length} seçili
              </span>
            </div>
          )}
          <div className="dsc-list" aria-busy={!isReady || isSaving}>
            {shown.map((discipline) => {
              const isOn = selected.includes(discipline.id);
              return (
                <label key={discipline.id} className={cx("dsc-row", isOn && "dsc-row--on")}>
                  <Checkbox
                    checked={isOn}
                    disabled={!isReady || isSaving}
                    onChange={() => toggle(discipline.id)}
                  />
                  <span className="dsc-dot" aria-hidden="true" style={{ backgroundColor: discipline.color }} />
                  <span className="dsc-row__code">{discipline.code}</span>
                  <span className="dsc-row__name">{discipline.name}</span>
                  <span className="dsc-row__used">{discipline.used_by_item_count} iş tipi</span>
                </label>
              );
            })}
            {shown.length === 0 && <div className="dsc-nohit">&quot;{query.trim()}&quot; ile eşleşen disiplin yok</div>}
          </div>
        </>
      )}

      {isEmptyCatalog && (
        <div className="dsc-empty">
          <div className="dsc-empty__title">Henüz disiplin tanımlı değil</div>
          <div className="dsc-empty__text">
            Önce Planlama → Birim Oran Kataloğu&apos;nda disiplin tanımlayın. O zamana kadar bütün kullanıcılar
            kısıtsızdır.
          </div>
          <Link href={routes.planning.catalog()} className="dsc-empty__link">
            Birim Oran Kataloğu&apos;na git →
          </Link>
        </div>
      )}

      {isAdminRole && selected.length > 0 && (
        <div className="dsc-banner dsc-banner--warn">
          <WarningTriangleIcon width={14} height={14} aria-hidden="true" />
          <span>
            Bu kullanıcı yönetici rolünde. Disiplin atanırsa o da yalnız seçilen disiplinleri görür; hakediş,
            sözleşme dağıtımı, bütçe dondurma, rapor onayı gibi toplu işlemlere erişemez.
          </span>
        </div>
      )}

      {saveError !== null && (
        <div className="dsc-banner dsc-banner--error" role="alert">
          <WarningTriangleIcon width={14} height={14} aria-hidden="true" />
          <span className="dsc-banner__text">
            <b>Kaydedilemedi.</b>
            {` ${saveError} Seçiminiz korunuyor.`}
          </span>
          <button type="button" className="dsc-banner__retry" onClick={submit}>
            Tekrar dene
          </button>
        </div>
      )}

      {isConfirmOpen && (
        <div className="dsc-confirm">
          <div className="dsc-confirm__card" role="alertdialog" aria-label="Kaydedilmemiş değişiklikler var">
            <div className="dsc-confirm__head">
              <h3 className="dsc-confirm__title">Kaydedilmemiş değişiklikler var</h3>
              <p className="dsc-confirm__text">Disiplin seçiminiz kaydedilmedi. Kapatırsanız kaybolur.</p>
            </div>
            <div className="dsc-confirm__actions">
              <Button variant="secondary" autoFocus onClick={() => setConfirmOpen(false)}>
                Vazgeç
              </Button>
              <Button variant="danger" onClick={onClose}>
                Değişiklikleri at
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
