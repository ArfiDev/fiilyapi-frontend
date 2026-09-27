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
import type { DeepScale } from "@/lib/api/scale";

/**
 * AI-CHAT-2 / K2 · sohbet geçmişi veri katmanı.
 *
 * Tipler `pnpm gen:api` çıktısından takma ad olarak alınır; elle arayüz yazmak
 * yasaktır (`useApprovals.ts` deseni).
 *
 * 🔴 Bu uçlar **catch-all BFF'ten** geçer (`/api/backend/ai/...`) ve `ai` kökü
 * `ALLOWED_ROOTS`ta ZATEN VAR (AI-0b T6'da eklendi) — yani modül canlıda 404
 * vermez. Akış ucu (`POST /ai/chat`) bilerek AYRI rotadadır: catch-all gövdeyi
 * tamponlar ve SSE'yi öldürür.
 *
 * 🔴 SAHİPLİK: bir kullanıcı yalnız **kendi** sohbetlerini görür. Kapı
 * backend'de (`WHERE user_id = :actor`) ve istemci onu İKAME ETMEZ — burada
 * hiçbir süzgeç yoktur, olmamalıdır.
 */
export type AiConversationRead = components["schemas"]["AiConversationRead"];
export type AiConversationListResponse = components["schemas"]["AiConversationListResponse"];
export type AiConversationDetail = components["schemas"]["AiConversationDetail"];
export type AiMessageRead = DeepScale<components["schemas"]["AiMessageRead"]>;

export const AI_CONVERSATIONS_QUERY_KEY = "ai-conversations";
export const AI_CONVERSATION_QUERY_KEY = "ai-conversation";

/** `GET /ai/conversations` `limit` tavanı (openapi: `le=100`, varsayılan 50). */
export const AI_CONVERSATIONS_MAX_LIMIT = 100;

export function useAiConversations(): UseQueryResult<AiConversationListResponse> {
  return useQuery({
    queryKey: [AI_CONVERSATIONS_QUERY_KEY],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/ai/conversations", {
          // 🔴 `limit` AÇIKÇA gönderilir: sessiz kırpma, kullanıcının kendi
          // sohbetinin listeden düşmesi demektir.
          params: { query: { limit: AI_CONVERSATIONS_MAX_LIMIT, offset: 0 } },
        }),
      ),
  });
}

export function useAiConversation(
  conversationId: string | null,
): UseQueryResult<AiConversationDetail> {
  return useQuery({
    queryKey: [AI_CONVERSATION_QUERY_KEY, conversationId],
    enabled: conversationId !== null,
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/ai/conversations/{conversation_id}", {
          params: { path: { conversation_id: conversationId as string } },
        }),
      ),
  });
}

export function useDeleteAiConversation(): UseMutationResult<unknown, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) =>
      unwrap(
        await backendClient.DELETE("/ai/conversations/{conversation_id}", {
          params: { path: { conversation_id: conversationId } },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [AI_CONVERSATIONS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [AI_CONVERSATION_QUERY_KEY] });
    },
  });
}
