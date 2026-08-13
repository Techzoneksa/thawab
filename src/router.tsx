import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Keep fetched data cached so revisiting a section renders instantly
        // from cache (no loading spinner) while it refreshes silently in the
        // background. Mutations still invalidate their queries explicitly, so
        // lists stay correct after create/edit/delete.
        staleTime: 60_000, // 1 min: data is "fresh" — no refetch on remount
        gcTime: 30 * 60_000, // 30 min: keep cache around across navigation
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Prefetch a route (its code chunk + loaders) as soon as the pointer
    // hovers/touches its link, so clicking feels instant.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
