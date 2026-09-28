/**
 * SEKME-F1.4a-FIX · TEST YARDIMCISI — Next 15 App Router'ın gezinme kuyruğunu
 * taklit eden ATMALI, ASENKRON sahte router (rv3 çürütme sondasından depoya
 * taşındı).
 *
 * Kaynak davranış (ölçüldü: `node_modules/next/dist/client/components/
 * app-router-instance.js`):
 * - `push`/`replace` = ACTION_NAVIGATE: ASENKRON — sunucu yanıtı gelene kadar
 *   URL DEĞİŞMEZ (bu sahtede `resolve()` çağrılana kadar).
 * - Bekleyen varken yeni NAVIGATE gelirse bekleyen `discarded` olur, durumu
 *   ASLA uygulanmaz.
 * - popstate (RESTORE) bekleyeni atar ve SENKRON uygulanır; tarayıcı gibi
 *   `window`a `popstate` olayı da atar.
 *
 * Kullanım (test dosyasında):
 *   vi.mock("next/navigation", async () =>
 *     (await import("./fake-app-router.testkit")).fakeNavigationModule());
 */
import { useSyncExternalStore } from "react";

interface PendingNav {
  readonly url: string;
  readonly mode: "push" | "replace";
}

export interface FakeAppRouter {
  readonly router: {
    push(url: string): void;
    replace(url: string): void;
    back(): void;
    forward(): void;
    refresh(): void;
    prefetch(): void;
  };
  /** Adres çubuğundaki (commit edilmiş) url. */
  committed(): string;
  hasPending(): boolean;
  /** Bekleyenin sunucu yanıtı geldi → commit (atılmadıysa). */
  resolve(): void;
  /** Bekleyenin yanıtı sunucu YÖNLENDİRMESİYLE başka adrese döndü. */
  resolveAs(url: string): void;
  /** Kuyruktan bağımsız ham commit (sayfa içi gezinmenin geldiği an). */
  commitRaw(url: string, mode: "push" | "replace"): void;
  /** Tarayıcı geri tuşu. */
  back(): void;
  /** Çağrı günlüğü: "push /x", "replace /y", "discard /x", "commit /x", "restore /x". */
  log(): readonly string[];
  /** Router'a gelen push+replace çağrı sayısı. */
  navigationCalls(): number;
  reset(start: string): void;
  subscribe(listener: () => void): () => void;
}

export function createFakeAppRouter(start = "/"): FakeAppRouter {
  let history: string[] = [start];
  let idx = 0;
  let pending: PendingNav | null = null;
  let entries: string[] = [];
  let calls = 0;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((l) => l());
  const committed = () => history[idx];

  function navigate(url: string, mode: "push" | "replace"): void {
    calls += 1;
    // Yeni NAVIGATE bekleyeni ATAR: onun durumu artık hiç uygulanmaz.
    if (pending) entries = [...entries, `discard ${pending.url}`];
    pending = { url, mode };
    entries = [...entries, `${mode} ${url}`];
  }

  function commitRaw(url: string, mode: "push" | "replace"): void {
    if (mode === "push") {
      history = [...history.slice(0, idx + 1), url];
      idx = history.length - 1;
    } else {
      history = history.map((h, i) => (i === idx ? url : h));
    }
    entries = [...entries, `commit ${url}`];
    notify();
  }

  function resolveAs(url: string | null): void {
    const p = pending;
    if (!p) throw new Error("bekleyen gezinme yok");
    pending = null;
    commitRaw(url ?? p.url, p.mode);
  }

  function back(): void {
    if (pending) entries = [...entries, `discard(by back) ${pending.url}`];
    pending = null;
    idx = Math.max(0, idx - 1);
    entries = [...entries, `restore ${committed()}`];
    window.dispatchEvent(new PopStateEvent("popstate"));
    notify();
  }

  return {
    router: {
      push: (url) => navigate(url, "push"),
      replace: (url) => navigate(url, "replace"),
      back,
      forward: () => {},
      refresh: () => {},
      prefetch: () => {},
    },
    committed,
    hasPending: () => pending !== null,
    resolve: () => resolveAs(null),
    resolveAs,
    commitRaw,
    back,
    log: () => entries,
    navigationCalls: () => calls,
    reset(next) {
      history = [next];
      idx = 0;
      pending = null;
      entries = [];
      calls = 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Test dosyaları arasında paylaşılmayan (her dosya kendi modül örneği) tekil sahte. */
export const fakeAppRouter: FakeAppRouter = createFakeAppRouter();

const searchCache = new Map<string, URLSearchParams>();

function searchParamsOf(url: string): URLSearchParams {
  const search = url.split("?")[1] ?? "";
  const cached = searchCache.get(search);
  if (cached) return cached;
  const fresh = new URLSearchParams(search);
  searchCache.set(search, fresh);
  return fresh;
}

/** `vi.mock("next/navigation", …)` fabrikasının döndüreceği modül. */
export function fakeNavigationModule() {
  return {
    usePathname: () =>
      useSyncExternalStore(fakeAppRouter.subscribe, () => fakeAppRouter.committed().split("?")[0]),
    useSearchParams: () =>
      useSyncExternalStore(fakeAppRouter.subscribe, () => searchParamsOf(fakeAppRouter.committed())),
    useRouter: () => fakeAppRouter.router,
  };
}
