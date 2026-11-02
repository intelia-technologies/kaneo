import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import appQueryClient from "@/query-client";
import useSetCustomFieldValue from "@/hooks/mutations/custom-field/use-set-custom-field-value";
import { useInvalidateInitiatives, useProjectInitiatives } from "./api";

// The server's state: what the next listing read returns.
const server = vi.hoisted(() => ({
  name: "Importación de pedidos",
  blockReason: null as string | null,
  reads: 0,
}));

vi.mock("@kaneo/libs", () => ({
  client: {
    intelia: {
      project: {
        ":projectId": {
          initiatives: {
            $get: async () => {
              server.reads += 1;
              return {
                ok: true,
                json: async () => ({
                  initiatives: [
                    {
                      id: "i1",
                      name: server.name,
                      blockedTasks: [
                        { id: "t1", blockReason: server.blockReason },
                      ],
                    },
                  ],
                  withoutInitiative: [],
                }),
              };
            },
          },
        },
      },
    },
  },
}));

vi.mock("@/fetchers/custom-field/set-custom-field-value", () => ({
  default: vi.fn(async () => {
    server.blockReason = "dependencias";
    return {};
  }),
}));

// A client with the app's real defaults (refetchOnMount and
// refetchOnWindowFocus off), not React Query's.
function appClient() {
  return new QueryClient({
    defaultOptions: appQueryClient.getDefaultOptions(),
  });
}

function Listing() {
  const { data } = useProjectInitiatives("p");
  const first = data?.initiatives[0];
  return (
    <p>
      {first?.name} · {first?.blockedTasks[0]?.blockReason ?? "sin motivo"}
    </p>
  );
}

beforeEach(() => {
  server.name = "Importación de pedidos";
  server.blockReason = null;
  server.reads = 0;
});

afterEach(() => {
  cleanup();
});

describe("initiative reads stay fresh", () => {
  it("shows the new name back on the listing after editing it in the detail", async () => {
    const client = appClient();
    const wrap = (node: ReactNode) => (
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    );

    // Listing → detail: the listing unmounts with its data cached.
    const listing = render(wrap(<Listing />));
    await screen.findByText(/Importación de pedidos ·/);
    listing.unmount();

    // In the detail, the edit is saved and invalidates the initiatives.
    server.name = "Importación de pedidos v2";
    const { result } = renderHook(() => useInvalidateInitiatives(), {
      wrapper: ({ children }) => wrap(children),
    });
    await act(() => result.current());

    // Detail → listing: the cached, invalidated listing is read again.
    render(wrap(<Listing />));
    expect(
      await screen.findByText(/Importación de pedidos v2 ·/),
    ).toBeInTheDocument();
    expect(server.reads).toBe(2);
  });

  it("does not read a fresh listing again just for mounting", async () => {
    const client = appClient();
    const wrap = (node: ReactNode) => (
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    );
    client.setDefaultOptions({
      queries: { ...client.getDefaultOptions().queries, staleTime: 60_000 },
    });

    const first = render(wrap(<Listing />));
    await screen.findByText(/Importación de pedidos ·/);
    first.unmount();
    render(wrap(<Listing />));
    await screen.findByText(/Importación de pedidos ·/);

    expect(server.reads).toBe(1);
  });

  it("updates the block reason on screen when the task sheet saves only that field", async () => {
    const client = appClient();
    function Page() {
      const save = useSetCustomFieldValue();
      return (
        <>
          <Listing />
          <button
            type="button"
            onClick={() =>
              save.mutate({
                taskId: "t1",
                fieldId: "motivo",
                value: "dependencias",
              })
            }
          >
            guardar
          </button>
        </>
      );
    }
    render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>,
    );
    await screen.findByText(/· sin motivo/);

    act(() => screen.getByRole("button", { name: "guardar" }).click());

    await waitFor(() =>
      expect(screen.getByText(/· dependencias/)).toBeInTheDocument(),
    );
  });
});
