/**
 * Proje ve şantiye DETAY sorgu anahtarı kökleri — `useProjects`/`useSites` bunları yeniden dışa aktarır.
 *
 * Ayrı, bağımlılıksız dosya: `useProjectScopeId` (düğme kapıları) bu iki anahtarı okumak için `useProjects`/
 * `useSites` modüllerini İÇE ALMAZ; böylece o modülleri kısmen mocklayan ekran testleri kapı kancasını bozmaz.
 */
export const PROJECT_QUERY_KEY = "project";
export const SITE_QUERY_KEY = "site";
