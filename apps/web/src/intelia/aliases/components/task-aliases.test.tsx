import { cleanup, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type * as ApiModule from "../api";
import { TaskAliases } from "./task-aliases";

const mocks = vi.hoisted(() => ({
  aliases: vi.fn(),
}));

let currentLang = "es-ES";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, Record<string, string>> = {
        "es-ES": {
          "intelia:aliases.formerly": "antes",
        },
        "en-US": {
          "intelia:aliases.formerly": "formerly",
        },
      };
      return (
        messages[currentLang]?.[key] ??
        (currentLang.startsWith("es") ? "antes" : "formerly")
      );
    },
    i18n: { language: currentLang },
  }),
}));
vi.mock("../i18n", () => ({}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    useTaskAliases: () => mocks.aliases(),
  };
});
vi.mock("@/lib/format", () => ({
  formatDateTime: (value: string) => value,
}));

describe("TaskAliases", () => {
  beforeEach(() => {
    currentLang = "es-ES";
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("with two aliases renders «antes SF-745, antes …» in Spanish", () => {
    mocks.aliases.mockReturnValue({
      data: [
        {
          ticketId: "SF-745",
          projectId: "proj-1",
          projectSlug: "SF",
          projectName: "Software Factory",
          number: 745,
          movedAt: "2026-11-04T12:00:00.000Z",
        },
        {
          ticketId: "SF-746",
          projectId: "proj-2",
          projectSlug: "SF",
          projectName: "Software Factory",
          number: 746,
          movedAt: "2026-11-04T13:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
    });

    const { container } = render(<TaskAliases taskId="task-1" />);
    expect(container).toHaveTextContent("antes SF-745, antes SF-746");

    const ticket1 = screen.getByText("SF-745");
    expect(ticket1).toHaveClass("font-mono");
    expect(ticket1.parentElement).toHaveAttribute(
      "title",
      "2026-11-04T12:00:00.000Z",
    );
    expect(screen.getByText("SF-746").parentElement).toHaveAttribute(
      "title",
      "2026-11-04T13:00:00.000Z",
    );
  });

  it("with none renders nothing", () => {
    mocks.aliases.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    const { container } = render(<TaskAliases taskId="task-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
