import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ImportProjectPicker } from "@/components/import/import-project-picker";
import { getImportSource } from "@/components/import/import-source-definitions";
import { ImportIssuesSection } from "@/components/project/code-hosting/import-issues-section";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));
vi.mock("./i18n", () => ({}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const REASON = "intelia:automation.importBlocked";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("imports that do not ask for the automation", () => {
  it("disables the code-host issue import and says why", () => {
    const onImport = vi.fn();
    render(
      <ImportIssuesSection
        description="Import issues"
        actionLabel="Import"
        pending={false}
        disabled={false}
        onImport={onImport}
      />,
    );

    const button = screen.getByRole("button", { name: "Import" });
    expect(button).toBeDisabled();
    expect(screen.getByText(REASON)).toBeInTheDocument();

    fireEvent.click(button);
    expect(onImport).not.toHaveBeenCalled();
  });

  it("disables starting an import run with picked projects and says why", () => {
    const onStart = vi.fn();
    render(
      <ImportProjectPicker
        source={getImportSource("linear")}
        workspaceId="ws1"
        workspaceName="Acme"
        projects={[{ id: "eng", name: "Engineering" }]}
        error={null}
        isStarting={false}
        onBack={vi.fn()}
        onStart={onStart}
      />,
    );

    fireEvent.click(screen.getByText("Engineering"));
    const button = screen.getByRole("button", {
      name: "settings:workspaceImport.units.team.importButton:1",
    });

    expect(button).toBeDisabled();
    expect(screen.getByText(REASON)).toBeInTheDocument();

    fireEvent.submit(button.closest("form") as HTMLFormElement);
    expect(onStart).not.toHaveBeenCalled();
  });
});
