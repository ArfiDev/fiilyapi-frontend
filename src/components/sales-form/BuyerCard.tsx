import { Field, Input, Select, Textarea } from "@/components/ui";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import type { CustomerResponse } from "@/lib/api/hooks/useCustomers";
import { userOptionLabel, type UserOption } from "@/lib/api/hooks/useUserOptions";

import {
  CUSTOMER_IDENTITY_MAX_LENGTH,
  CUSTOMER_MAX_LENGTH,
  CUSTOMER_TYPE_OPTIONS,
} from "./constants";
import type { SaleFormValues } from "./form-state";
import type { SaleFormErrors } from "./validate";

const PLACEHOLDER = "Seçiniz...";
const NEW_CUSTOMER_OPTION = "Yeni müşteri gir";
/** IZN-F4.3 GECE KARARI: ad maskeli (`null`) müşterinin seçenek metni; seçim yine id iledir. */
export const HIDDEN_CUSTOMER_OPTION = "Gizli müşteri";

interface BuyerCardProps {
  values: SaleFormValues;
  errors: SaleFormErrors;
  customers: readonly CustomerResponse[];
  /** Proje bağlamı: `satis_alici` gizliliği ekip rolünden okunur; yoksa ana rol. */
  projectId?: string;
  customersDisabled: boolean;
  advisors: readonly UserOption[];
  advisorsDisabled: boolean;
  advisorNote: string;
  onChangeField: <K extends keyof SaleFormValues>(field: K, value: SaleFormValues[K]) => void;
  onSelectCustomer: (customerId: string) => void;
  locked: boolean;
}

/**
 * "Alıcı Bilgileri" kartı (DS 66-78).
 *
 * ⚠️ ONAYLI TÜRETİM — "Kayıtlı Müşteri" seçici: `POST /projects/{id}/sales` bir
 * `customer_id` ZORUNLU kılar; mockup yalnız yeni müşteri alanlarını çizer.
 * Spec §1/DS "müşteri seçimi + yeni müşteri" der → kartın başına TEK ek satır
 * (kayıtlı müşteri seçimi) eklenir. Varsayılan "Yeni müşteri"dir; böylece
 * baseline mockup'ın inline alanlarıyla birebir kalır. Kayıtlı müşteri
 * seçildiğinde inline alanlar salt-okunur aynadır.
 *
 * ⚠️ TCKN ve VKN mockup'ta TEK kutudur (72) — `buyerType`e göre `national_id`
 * ya da `tax_number`a çevrilir (`build-body.ts`).
 */
export function BuyerCard({
  values,
  errors,
  customers,
  projectId,
  customersDisabled,
  advisors,
  advisorsDisabled,
  advisorNote,
  onChangeField,
  onSelectCustomer,
  locked,
}: BuyerCardProps) {
  const isBuyerHidden = useCategoryHidden("satis_alici", projectId);
  const hasHiddenCustomer = customers.some((customer) => customer.name === null);
  const isExisting = values.customerMode === "existing";
  const readOnlyInline = isExisting || locked;
  const idLabel = values.buyerType === "person" ? "TCKN" : "VKN";

  return (
    <section className="pf-card">
      <h2 className="pf-card__title">👤 Alıcı Bilgileri</h2>

      {/* ONAYLI TÜRETİM — kayıtlı müşteri seçimi (spec §1/DS) */}
      <div className="pf-grid">
        <Field
          label="Kayıtlı Müşteri"
          hint={
            <>
              Kayıtlı bir müşteri seçin ya da “Yeni müşteri gir” ile aşağıdan girin.
              {hasHiddenCustomer && isBuyerHidden && <HiddenMark withText />}
            </>
          }
          error={errors.existingCustomerId}
        >
          {(control) => (
            <Select
              {...control}
              data-testid="satis-form-musteri-sec"
              disabled={customersDisabled || locked}
              value={isExisting ? values.existingCustomerId : ""}
              onChange={(event) => onSelectCustomer(event.target.value)}
            >
              <option value="">{NEW_CUSTOMER_OPTION}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name ?? HIDDEN_CUSTOMER_OPTION}
                  {customer.national_id ? ` · ${customer.national_id}` : ""}
                  {customer.tax_number ? ` · ${customer.tax_number}` : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="pf-grid pf-grid--3">
        {/* 70 */}
        <Field label="Alıcı Tipi">
          {(control) => (
            <Select
              {...control}
              data-testid="satis-form-alici-tipi"
              disabled={readOnlyInline}
              value={values.buyerType}
              onChange={(event) =>
                onChangeField("buyerType", event.target.value as SaleFormValues["buyerType"])
              }
            >
              {CUSTOMER_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 71 */}
        <Field label="Ad Soyad / Ünvan" required={!isExisting} error={errors.buyerName}>
          {(control) => (
            <Input
              {...control}
              data-testid="satis-form-alici-ad"
              maxLength={CUSTOMER_MAX_LENGTH.name}
              placeholder="Serkan Öz"
              readOnly={readOnlyInline}
              value={values.buyerName}
              onChange={(event) => onChangeField("buyerName", event.target.value)}
            />
          )}
        </Field>

        {/* 72 — tek TCKN/VKN kutusu */}
        <Field label={`${idLabel} / ${idLabel === "TCKN" ? "VKN" : "TCKN"}`} required={!isExisting} error={errors.buyerNationalOrTaxId}>
          {(control) => (
            <Input
              {...control}
              className="sf-amount-input"
              data-testid="satis-form-alici-kimlik"
              maxLength={CUSTOMER_IDENTITY_MAX_LENGTH}
              placeholder="12345678901"
              readOnly={readOnlyInline}
              value={values.buyerNationalOrTaxId}
              onChange={(event) => onChangeField("buyerNationalOrTaxId", event.target.value)}
            />
          )}
        </Field>

        {/* 73 */}
        <Field label="Telefon" required={!isExisting} error={errors.buyerPhone}>
          {(control) => (
            <Input
              {...control}
              type="tel"
              data-testid="satis-form-alici-telefon"
              maxLength={CUSTOMER_MAX_LENGTH.phone}
              placeholder="0532 123 45 67"
              readOnly={readOnlyInline}
              value={values.buyerPhone}
              onChange={(event) => onChangeField("buyerPhone", event.target.value)}
            />
          )}
        </Field>

        {/* 74 */}
        <Field label="E-posta">
          {(control) => (
            <Input
              {...control}
              type="email"
              data-testid="satis-form-alici-eposta"
              maxLength={CUSTOMER_MAX_LENGTH.email}
              placeholder="serkan@example.com"
              readOnly={readOnlyInline}
              value={values.buyerEmail}
              onChange={(event) => onChangeField("buyerEmail", event.target.value)}
            />
          )}
        </Field>

        {/* 75 — satış danışmanı: GERÇEK kullanıcı listesi */}
        <Field label="Satış Danışmanı" hint={advisorNote || undefined}>
          {(control) => (
            <Select
              {...control}
              data-testid="satis-form-danisman"
              disabled={advisorsDisabled || locked}
              value={values.advisorUserId}
              onChange={(event) => onChangeField("advisorUserId", event.target.value)}
            >
              <option value="">{PLACEHOLDER}</option>
              {advisors.map((advisor) => (
                <option key={advisor.id} value={advisor.id}>
                  {userOptionLabel(advisor)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 76 — adres tam genişlik */}
        <Field label="Adres" className="pf-col-span-3">
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              data-testid="satis-form-alici-adres"
              placeholder="Alıcı ikamet adresi"
              readOnly={readOnlyInline}
              value={values.buyerAddress}
              onChange={(event) => onChangeField("buyerAddress", event.target.value)}
            />
          )}
        </Field>
      </div>
    </section>
  );
}
