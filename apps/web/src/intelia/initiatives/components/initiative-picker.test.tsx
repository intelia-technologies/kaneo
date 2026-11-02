import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";
import { InitiativePicker } from "./initiative-picker";

const mocks = vi.hoisted(() => ({
  options: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: "en-US" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("../i18n", () => ({}));

vi.mock("../api", () => ({
  useInitiativeOptions: (projectId: string | undefined) =>
    mocks.options(projectId),
  useCreateInitiative: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));

const sampleOptions = [
  { id: "init-1", name: "Plan de Acción", planClosedAt: null },
  {
    id: "init-2",
    name: "Modernización",
    planClosedAt: "2026-11-01T10:00:00.000Z",
  },
  { id: "init-3", name: "Infraestructura Base", planClosedAt: null },
];

beforeEach(() => {
  mocks.options.mockReturnValue({
    data: sampleOptions,
    isLoading: false,
  });
  mocks.mutateAsync.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InitiativePicker", () => {
  it("shows placeholder when no value is selected (no preselection)", () => {
    render(
      <InitiativePicker projectId="proj-1" value={null} onChange={vi.fn()} />,
    );

    const combobox = screen.getByRole("combobox");
    expect(combobox.textContent).toContain("intelia:initiative.placeholder");
  });

  it("shows the selected initiative name", () => {
    render(
      <InitiativePicker projectId="proj-1" value="init-1" onChange={vi.fn()} />,
    );

    const combobox = screen.getByRole("combobox");
    expect(combobox.textContent).toContain("Plan de Acción");
  });

  it("picker search filters accent-insensitively", async () => {
    render(
      <InitiativePicker projectId="proj-1" value={null} onChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    const input = await screen.findByPlaceholderText(
      "intelia:initiative.searchPlaceholder",
    );

    // Search without accents for "accion" -> should match "Plan de Acción"
    fireEvent.change(input, { target: { value: "accion" } });

    expect(await screen.findByText("Plan de Acción")).toBeTruthy();
    expect(screen.queryByText("Modernización")).toBeNull();
    expect(screen.queryByText("Infraestructura Base")).toBeNull();

    // Search without accents for "modernizacion" -> should match "Modernización"
    fireEvent.change(input, { target: { value: "modernizacion" } });
    expect(await screen.findByText("Modernización")).toBeTruthy();
    expect(screen.queryByText("Plan de Acción")).toBeNull();
  });

  it("marks options as plan closed when planClosedAt is present", async () => {
    render(
      <InitiativePicker projectId="proj-1" value={null} onChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    await screen.findByPlaceholderText("intelia:initiative.searchPlaceholder");

    expect(
      await screen.findByText("intelia:initiative.planClosedBadge"),
    ).toBeTruthy();
  });

  it("regression: ArrowDown + Enter selects the matching option and does NOT create", async () => {
    const onChange = vi.fn();
    render(
      <InitiativePicker projectId="proj-1" value={null} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    const input = await screen.findByPlaceholderText(
      "intelia:initiative.searchPlaceholder",
    );

    // Search "accion" -> matching option "Plan de Acción" exists and is highlighted
    fireEvent.change(input, { target: { value: "accion" } });
    await screen.findByText("Plan de Acción");

    // Pressing Enter on the highlighted option selects it
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("init-1");
      expect(mocks.mutateAsync).not.toHaveBeenCalled();
    });
  });

  it("create-from-search calls POST and selects the new id", async () => {
    const onChange = vi.fn();
    mocks.mutateAsync.mockResolvedValue({
      id: "init-new",
      name: "Nueva Iniciativa",
      planClosedAt: null,
    });

    render(
      <InitiativePicker projectId="proj-1" value={null} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    const input = await screen.findByPlaceholderText(
      "intelia:initiative.searchPlaceholder",
    );

    fireEvent.change(input, { target: { value: "Nueva Iniciativa" } });

    const createOption = await screen.findByText(/Nueva Iniciativa/);
    fireEvent.click(createOption);

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        projectId: "proj-1",
        name: "Nueva Iniciativa",
      });
      expect(onChange).toHaveBeenCalledWith("init-new");
    });
  });

  it("409 keeps value and surfaces error without changing value", async () => {
    const onChange = vi.fn();
    mocks.mutateAsync.mockRejectedValue(
      new HttpError(409, "Initiative name taken", {
        code: "INITIATIVE_NAME_TAKEN",
      }),
    );

    render(
      <InitiativePicker
        projectId="proj-1"
        value="init-1"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    const input = await screen.findByPlaceholderText(
      "intelia:initiative.searchPlaceholder",
    );

    fireEvent.change(input, { target: { value: "Nombre Duplicado" } });

    const createOption = await screen.findByText(/Nombre Duplicado/);
    fireEvent.click(createOption);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "intelia:initiative.nameTaken",
    );
  });

  it("is disabled when projectId is undefined or disabled prop is true", () => {
    const { rerender } = render(
      <InitiativePicker
        projectId={undefined}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();

    rerender(
      <InitiativePicker
        projectId="proj-1"
        value={null}
        disabled={true}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
