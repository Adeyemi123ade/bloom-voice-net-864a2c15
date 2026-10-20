import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
}));
const auth = vi.hoisted(() => ({ user: null, loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("@/components/MobileFrame", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import Login from "@/pages/Login";
import Register from "@/pages/Register";

function renderIn(lang: string, page: React.ReactNode) {
  localStorage.setItem("chichat:language", lang);
  return render(
    <LanguageProvider>
      <MemoryRouter>{page}</MemoryRouter>
    </LanguageProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe("Sign in and sign up follow the chosen language", () => {
  it("Sign in in Igbo, including the brand line and Google button", () => {
    renderIn("ig", <Login />);
    expect(screen.getByText("Nnọọ ọzọ")).toBeInTheDocument();
    expect(screen.getByText("Nweta ahụmịhe ohere niile")).toBeInTheDocument();
    expect(screen.getByText("Gaa n'ihu na Google")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asụsụ" })).toHaveTextContent("Igbo");
  });

  it("Sign up in Hausa, and its form errors are translated", () => {
    renderIn("ha", <Register />);
    expect(screen.getByText("Buɗe asusunka")).toBeInTheDocument();
    expect(screen.getByText("Cikakken suna")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ci gaba" }));
    expect(screen.getByText("Suna dole ya kai akalla haruffa 2")).toBeInTheDocument();
    expect(screen.getByText("Shigar da ingantaccen adireshin imel")).toBeInTheDocument();
  });

  it("Sign up password hints in Yoruba", () => {
    renderIn("yo", <Register />);
    expect(screen.getByText("Lẹ́tà mẹ́jọ tàbí jù")).toBeInTheDocument();
    expect(screen.getByText("Àwọn òfin iṣẹ́")).toBeInTheDocument();
  });

  it("English stays as it was", () => {
    renderIn("en", <Login />);
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("Continue with Google")).toBeInTheDocument();
  });
});
