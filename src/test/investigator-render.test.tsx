import { describe, expect, it, beforeEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import InvestigatorPage from "@/components/investigator/InvestigatorPage";
import { useInvestigatorWorkspace } from "@/stores/investigatorWorkspaceStore";

describe("InvestigatorPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    useInvestigatorWorkspace.getState().resetWorkspace();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it("renders a fresh workspace without throwing", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <InvestigatorPage />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });

    expect(container.textContent).toContain("Untitled Investigator");
  });
});
