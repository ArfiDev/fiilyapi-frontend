import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import { PAYROLL_PERIODS_QUERY_KEY } from "./usePayroll";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-BORORAN · `Ayarlar > Bordro Oranları` veri katmanı.
 *
 * 🔴 **NEDEN BU EKRAN VAR:** oranlar ve gelir vergisi tarifesi VERİDİR (K1) ve
 * yalnız **2026** tohumlanmıştır (`rate_seed_data.RATE_SEED_YEAR` /
 * `tax_bracket_seed_data.TAX_BRACKET_SEED_YEAR`; 2027 KASTEN yoktur, mevzuat
 * icat edilmez). Dilim seti olmayan yıl **fail-closed**tur: satır `uncomputed`
 * kalır, 0 vergi YAZILMAZ. Bu ekran olmadan Ocak 2027 bordrosu sessizce
 * "Hesaplanamadı"ya düşer ve **arayüzden düzeltilemezdi.**
 *
 * Tipler `pnpm gen:api` çıktısından TAKMA AD olarak alınır; elle arayüz yazmak
 * YASAK (`useApprovals.ts` kanonu).
 */
export type PayrollRateResponse = DeepScale<components["schemas"]["PayrollRateResponse"]>;
export type PayrollRateListResponse = components["schemas"]["PayrollRateListResponse"];
export type PayrollRateUpdate = DeepScale<components["schemas"]["PayrollRateUpdate"]>;
export type PayrollTaxBracketResponse = DeepScale<components["schemas"]["PayrollTaxBracketResponse"]>;
export type PayrollTaxBracketListResponse =
  components["schemas"]["PayrollTaxBracketListResponse"];
export type PayrollTaxBracketSetUpdate = components["schemas"]["PayrollTaxBracketSetUpdate"];
export type WorkerSource = components["schemas"]["WorkerSource"];
export type IncomeKind = components["schemas"]["IncomeKind"];

export const PAYROLL_RATES_QUERY_KEY = "payroll-rates";
export const PAYROLL_TAX_BRACKETS_QUERY_KEY = "payroll-tax-brackets";

/**
 * 🔴 **BU UÇ BİR YIL/TİP KATALOĞU DEĞİLDİR — ölçüldü**
 * (`payroll/service/rates.py::list_rates`): sorgu düpedüz `select(PayrollRate)`
 * tir. Yani dönen küme "sistemin desteklediği yıllar" değil, **girilmiş
 * satırlar**dır; 2027 için yanıt `{items: [], total: 0}`dır.
 *
 * Sonucu ekranın TASARIMINI belirler ve F-OKROL'ün `GET /approvals/roles`
 * dersiyle AYNI SINIFTIR: ekran yıl listesini bu uçtan türetseydi, oranı hiç
 * girilmemiş bir yıl **hiç seçilemez** ve ekran kendi işini yapamazdı. Yıl
 * kümesi `buildYearOptions` ile kurulur (veri ∪ bu yıl ∪ gelecek yıl).
 *
 * `year` süzgeci GÖNDERİLMEZ: sayfalama YOKTUR (şema kararı: "tablo yılda en
 * çok DÖRT satır büyür") ve tek çekim hem yıl seçeneklerini hem seçili yılın
 * satırlarını besler — yıl değiştikçe yeni istek atmak, seçenek listesini
 * kendi kaynağından koparırdı.
 */
export function usePayrollRates(): UseQueryResult<PayrollRateListResponse, Error> {
  return useQuery({
    queryKey: [PAYROLL_RATES_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/payroll/rates", {})),
  });
}

/**
 * `GET /payroll/tax-brackets` — tarifenin TAMAMI.
 *
 * 🔴 Uç açıklamasının kendi ifadesiyle *"bu uç aynı zamanda PUT'un ÖN
 * KOŞULUDUR: tam küme değiştirmeye açılan bir yüzeyin, kümenin TAMAMINI okuyan
 * bir eşi olmak zorundadır — yoksa kullanıcı neyin üstüne yazdığını göremeden
 * yazar."* Ekran bu yüzden TÜM seti okur ve tabloda basar.
 */
export function usePayrollTaxBrackets(): UseQueryResult<PayrollTaxBracketListResponse, Error> {
  return useQuery({
    queryKey: [PAYROLL_TAX_BRACKETS_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/payroll/tax-brackets", {})),
  });
}

export interface UpsertPayrollRateInput {
  year: number;
  source: WorkerSource;
  /** TAM SET — yedi oranın hepsi (`income_tax_pct` `null` olabilir). */
  body: PayrollRateUpdate;
}

/**
 * `PUT /payroll/rates/{year}/{source}` — set açar ya da DEĞİŞTİRİR.
 *
 * 🔴 Yetki kapısı `payroll:**full**`dur (`router.py:_FULL`), okuma ise
 * `payroll:view`. 409: o yılda `approved`/`paid` dönem varsa yazma REDDEDİLİR.
 *
 * Bordro dönemlerinin toplamları CANLI orandan türer (`summary.py`), bu yüzden
 * dönem sorguları da bayatlar.
 */
export function useUpsertPayrollRate(): UseMutationResult<
  PayrollRateResponse,
  Error,
  UpsertPayrollRateInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, source, body }) =>
      unwrap(
        await backendClient.PUT("/payroll/rates/{year}/{source}", {
          params: { path: { year, source } },
          body,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PAYROLL_RATES_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [PAYROLL_PERIODS_QUERY_KEY] });
    },
  });
}

export interface ReplacePayrollTaxBracketsInput {
  year: number;
  incomeKind: IncomeKind;
  /** 🔴 TAM KÜME — gövdede OLMAYAN her dilim SUNUCUDAN SİLİNİR. */
  body: PayrollTaxBracketSetUpdate;
}

/**
 * `PUT /payroll/tax-brackets/{year}/{income_kind}` — yılın tarifesini TAM KÜME
 * olarak değiştirir.
 *
 * 🔴 **YETKİ KAPISI ORAN UCUNUNKİNDEN FARKLIDIR:** `payroll:**admin**`
 * (`router.py:_ADMIN`), oran ucu ise `full`. Ölçüldü, varsayılmadı — ekran bu
 * yüzden İKİ ayrı kapı kurar; tek "Kaydet" düğmesi `full` seviyeli bir
 * kullanıcıya oranı kaydettirip tarifede 403 aldırırdı.
 *
 * 🔴 Küme bütünlüğü (boşluk · örtüşme · ortada açık uç · sınırlı SON dilim)
 * sunucuda `income_tax.normalize_brackets`e devredilir ve **422**dir; istemci
 * korkuluğu `checkBracketSet` aynı beş kuralı ÖNDEN uygular.
 */
export function useReplacePayrollTaxBrackets(): UseMutationResult<
  PayrollTaxBracketListResponse,
  Error,
  ReplacePayrollTaxBracketsInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, incomeKind, body }) =>
      unwrap(
        await backendClient.PUT("/payroll/tax-brackets/{year}/{income_kind}", {
          params: { path: { year, income_kind: incomeKind } },
          body,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PAYROLL_TAX_BRACKETS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [PAYROLL_PERIODS_QUERY_KEY] });
    },
  });
}
