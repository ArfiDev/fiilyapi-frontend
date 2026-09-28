"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/settings/Modal";
import { siteStockEntryHref } from "@/components/stock/stock-labels";
import { Button, Checkbox, Field, Input, Select } from "@/components/ui";
import { useSiteFanOutOptions } from "@/lib/api/hooks/useSiteFanOutOptions";
import { useCreateWarehouse } from "@/lib/api/hooks/useStockMutations";
import { listTruncationMessage } from "@/lib/list-truncation";
import { stockErrorMessage } from "@/lib/api/stock-error";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { buildWarehouseBody } from "./build-body";
import {
  buildSiteFanOutErrorMessage,
  buildSiteOptionLabel,
  CENTRAL_INFO,
  EMPTY_OPTION_VALUE,
  KEEP_FLOW_NEEDS_SITE_REASON,
  MAX_LENGTH,
  NAME_REQUIRED_MESSAGE,
  WAREHOUSE_TEXT as TEXT,
} from "./constants";
import "./warehouse-form.css";

/**
 * DP · `Form - Depo Ekle.dc.html` (F-BLG T2c) — `POST /warehouses`.
 *
 * 🔴 ESKİ SAPMA S3 GEÇERSİZ: bu diyalog "hiçbir mockup'ta yok" gerekçesiyle
 * türetilmişti; mockup geldi ve MOCKUP KAZANIR (yönetim kararı). İki yapısal
 * değişiklik:
 *   1) Şantiye seçimi artık TEK seçicidir (86-96). Eski iki adımlı
 *      "Proje → Şantiye" akışı mockup'ta YOKTUR; seçenek metni
 *      "Şantiye · Proje" (90-93).
 *   2) Canlı önizleme (98-109), mavi bilgi kutusu (111-116) ve alt onay
 *      kutusu (119-127) eklendi.
 *
 * ⚠️ `site_id` seçilmezse gövdede HİÇ TAŞINMAZ ve MERKEZ DEPO oluşur
 * (`build-body.ts` notu) — bu davranış eski dosyadan KORUNDU.
 */
export interface WarehouseModalProps {
  onClose: () => void;
}

export function WarehouseModal({ onClose }: WarehouseModalProps) {
  const router = useRouter();
  const createWarehouse = useCreateWarehouse();
  const siteOptions = useSiteFanOutOptions();

  const [name, setName] = useState("");
  const [siteId, setSiteId] = useState(EMPTY_OPTION_VALUE);
  const [shouldReturnToEntry, setShouldReturnToEntry] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // SEKME-F1.3b · dirty (tercih 1): oluşturma formu, taban boş. ASYNC TABAN
  // DEĞİL. Kayıttan sonra `router.push`/`onClose()` unmount ile sıfırlar.
  const isDirty = name.trim() !== "" || siteId !== EMPTY_OPTION_VALUE || shouldReturnToEntry;
  // KURAL 7 · Modal'a isDirty VERİLMEZ, doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Depo");

  const isPending = createWarehouse.isPending;
  const selectedSite = siteOptions.options.find((option) => option.siteId === siteId) ?? null;
  const trimmedName = name.trim();

  function handleSubmit() {
    if (!trimmedName) {
      setFormError(NAME_REQUIRED_MESSAGE);
      return;
    }
    setFormError(null);

    createWarehouse.mutate(buildWarehouseBody(name, siteId), {
      onSuccess: () => {
        // 119-127 · onay kutusu GERÇEK: kayıttan sonra seçilen şantiyenin
        // stok giriş ekranına dönülür (kutu yalnız şantiye seçiliyken açıktır).
        if (shouldReturnToEntry && selectedSite) {
          router.push(siteStockEntryHref(selectedSite.projectId, selectedSite.siteId));
        }
        onClose();
      },
      // ST §4b kanonu: bulunamayan `site_id` 404, ad çakışması 422/409 —
      // gövdedeki Türkçe `detail` olduğu gibi basılır.
      onError: (error) => setFormError(stockErrorMessage(error)),
    });
  }

  return (
    <Modal
      title={TEXT.title}
      onClose={onClose}
      footer={
        <>
          {/* 121-124 · onay kutusu SOLDA */}
          <Checkbox
            className="whf__keep-flow"
            label={TEXT.keepFlow}
            checked={shouldReturnToEntry && selectedSite !== null}
            disabled={selectedSite === null || isPending}
            onChange={(event) => setShouldReturnToEntry(event.target.checked)}
            data-testid="whf-keep-flow"
          />
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {TEXT.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            {TEXT.submit}
          </Button>
        </>
      }
    >
      <p className="whf__subtitle">{TEXT.subtitle}</p>

      {/* 80-84 · Depo Adı */}
      <Field label={TEXT.name} required hint={TEXT.nameHint}>
        {(control) => (
          <Input
            {...control}
            value={name}
            maxLength={MAX_LENGTH.name}
            placeholder={TEXT.namePlaceholder}
            disabled={isPending}
            onChange={(event) => setName(event.target.value)}
            data-testid="whf-name"
          />
        )}
      </Field>

      {/* 86-96 · TEK seçici: "Şantiye · Proje" */}
      <Field
        label={TEXT.site}
        hint={
          <>
            {TEXT.siteHintPrefix}
            <strong>{TEXT.siteHintStrong}</strong>
            {TEXT.siteHintSuffix}
          </>
        }
      >
        {(control) => (
          <Select
            {...control}
            value={siteId}
            disabled={isPending}
            onChange={(event) => {
              const nextSiteId = event.target.value;
              setSiteId(nextSiteId);
              // M5_1 kayıt #58: şantiye BOŞALINCA niyet de sıfırlanmalı —
              // eskiden yalnız checkbox `onChange`de yazılıyordu, ham state
              // `shouldReturnToEntry` şantiye boşalınca SIFIRLANMIYORDU. Kutu
              // görünen türevle (`checked={shouldReturnToEntry &&
              // selectedSite !== null}`) boş görünse de `onSuccess`teki
              // gerçek okuma ham state'i okuduğu için şantiye yeniden
              // seçilince eski niyet sessizce diriliyordu.
              if (nextSiteId === EMPTY_OPTION_VALUE) setShouldReturnToEntry(false);
            }}
            data-testid="whf-site"
          >
            <option value={EMPTY_OPTION_VALUE}>{TEXT.siteEmptyOption}</option>
            {siteOptions.options.map((option) => (
              <option key={option.siteId} value={option.siteId}>
                {buildSiteOptionLabel(option.siteName, option.projectName)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {/*
        Fan-out BİTTİ işareti (`makine-loaded-sites` deseni). Şantiye
        seçenekleri TEK sorgudan değil, proje listesi + her projenin şantiye
        sorgusundan (kayar pencere) toplanır; bu kaynağın "yüklendi" hâli
        ekranda GÖRÜNMEZ (seçici her hâlde çizilir). Görsel kadraj yarım
        pencerede kare almasın diye durum DOM'a düşürülür — `hidden` olduğu
        için kareye HİÇ girmez.
      */}
      {!siteOptions.isLoading && <span hidden data-testid="whf-sites-loaded" />}

      {/* Fan-out'un eksikleri SESSİZ kalmaz. */}
      {siteOptions.failedProjectNames.length > 0 && (
        <p className="whf__notice" data-testid="whf-site-fanout-error">
          {buildSiteFanOutErrorMessage(siteOptions.failedProjectNames)}
        </p>
      )}
      {siteOptions.isPartial && (
        <p className="whf__notice" data-testid="whf-site-truncation">
          {listTruncationMessage(siteOptions.truncation)}
        </p>
      )}

      {/* 98-109 · canlı önizleme */}
      <div className="whf-preview" data-testid="whf-preview">
        <p className="whf-preview__title">{TEXT.previewTitle}</p>
        <div className="whf-preview__row">
          <span className="whf-preview__icon" aria-hidden="true">
            {TEXT.previewIcon}
          </span>
          <span className="whf-preview__body">
            <span
              className={
                trimmedName ? "whf-preview__name" : "whf-preview__name whf-preview__name--empty"
              }
            >
              {trimmedName || TEXT.previewNamePlaceholder}
            </span>
            <span className="whf-preview__scope">
              {selectedSite
                ? buildSiteOptionLabel(selectedSite.siteName, selectedSite.projectName)
                : TEXT.previewCentralLabel}
            </span>
          </span>
          {/* 107 · rozet YALNIZ merkez depo kipinde çizilmiştir */}
          {selectedSite === null && (
            <span className="whf-preview__badge" data-testid="whf-central-badge">
              {TEXT.centralBadge}
            </span>
          )}
        </div>
      </div>

      {/* 111-116 · merkez/şantiye farkı */}
      <p className="whf-info">
        <strong>{CENTRAL_INFO.leadStrong}</strong>
        {CENTRAL_INFO.middle}
        <strong>{CENTRAL_INFO.secondStrong}</strong>
        {CENTRAL_INFO.tail}
      </p>

      {/* 🔴 119-127 · kapsamsız stok giriş rotası YOK — gerekçe GÖRÜNÜR */}
      {selectedSite === null && (
        <p className="whf-readonly-note" data-testid="whf-keep-flow-reason">
          {KEEP_FLOW_NEEDS_SITE_REASON}
        </p>
      )}

      {formError && (
        <p className="whf__error" data-testid="whf-error">
          {formError}
        </p>
      )}
    </Modal>
  );
}
