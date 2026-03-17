import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StagingLoginPage from "@/app/staging-login/page";

const navMocks = vi.hoisted(() => ({
  push: vi.fn(),
  searchParams: new URLSearchParams(""),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navMocks.searchParams,
  useRouter: () => ({ push: navMocks.push }),
}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

describe("StagingLoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    navMocks.push.mockReset();
    navMocks.searchParams = new URLSearchParams("");
  });

  function renderPage(searchParams?: string) {
    if (searchParams) {
      navMocks.searchParams = new URLSearchParams(searchParams);
    }
    return render(<StagingLoginPage />);
  }

  it("renders a password input and submit button", () => {
    renderPage();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enter/i })).toBeInTheDocument();
  });

  it("submits the password via POST to /api/staging-auth", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Password"), "my-secret");
    await user.click(screen.getByRole("button", { name: /enter/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/staging-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "my-secret" }),
    });
  });

  it("redirects to / on success when no ?from param", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /enter/i }));

    await waitFor(() => expect(navMocks.push).toHaveBeenCalledWith("/"));
  });

  it("redirects to ?from value on success", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    renderPage("from=/settings");
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /enter/i }));

    await waitFor(() => expect(navMocks.push).toHaveBeenCalledWith("/settings"));
  });

  it("shows error message on 401 response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /enter/i }));

    await waitFor(() =>
      expect(screen.getByText(/incorrect password/i)).toBeInTheDocument(),
    );
  });

  it("does not submit when password is empty", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /enter/i }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
