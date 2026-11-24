import { Suspense, lazy, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { RatesInfo, Session } from "./api";
import { api, fmtDate, readSession } from "./api";
import Calculator from "./Calculator";
import Landing from "./Landing";
import LoginPage, { ChangePasswordModal } from "./LoginPage";
import {
  ActivityIcon,
  Brand,
  CalculatorIcon,
  ChartIcon,
  HistoryIcon,
  KeyIcon,
  SettingsIcon,
  Spinner,
  TableIcon,
  UsersIcon,
} from "./Ui";
import type { Notice } from "./Ui";

// Admin pages (and the chart library) are only downloaded when an admin opens them
const Dashboard = lazy(() => import("./admin/Dashboard"));
const History = lazy(() => import("./admin/History"));
const RateCards = lazy(() => import("./admin/RateCards"));
const Users = lazy(() => import("./admin/Users"));
const SettingsPage = lazy(() => import("./admin/Settings"));
const ActivityPage = lazy(() => import("./admin/Settings").then((m) => ({ default: m.ActivityLog })));

type Tab = "dashboard" | "calculator" | "history" | "rates" | "users" | "settings" | "activity";

const ADMIN_TABS: [Tab, string, ReactNode][] = [
  ["dashboard", "Dashboard", <ChartIcon key="d" />],
  ["calculator", "Rate Calculator", <CalculatorIcon key="c" />],
  ["history", "History", <HistoryIcon key="h" />],
  ["rates", "Rate Cards", <TableIcon key="r" />],
  ["users", "Users", <UsersIcon key="u" />],
  ["settings", "Settings", <SettingsIcon key="s" />],
  ["activity", "Activity", <ActivityIcon key="a" />],
];

// ---------------------------------------------------------------------------
// Header and hero
// ---------------------------------------------------------------------------
function Header({
  info,
  session,
  onChangePassword,
  onSignOut,
}: {
  info: RatesInfo | null;
  session: Session;
  onChangePassword: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="brand-grid relative overflow-hidden bg-brand-navy text-white shadow-[0_8px_30px_rgba(7,27,85,0.18)]">
      <div className="brand-ribbon pointer-events-none absolute -right-16 -top-32 h-80 w-96 opacity-80" />
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-brand-red via-white to-brand-bright" />

      <div className="relative mx-auto flex h-[84px] max-w-[1180px] items-center justify-between gap-3 px-5 sm:px-8">
        <Brand />

        <div className="flex items-center gap-2 sm:gap-3">
          {info && (
            <div className="hidden items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-xs font-bold text-white ring-1 ring-white/20 backdrop-blur-sm lg:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                <span className="relative h-2 w-2 rounded-full bg-brand-red" />
              </span>
              Rates updated {fmtDate(info.last_updated)}
            </div>
          )}
          <div className="hidden text-right md:block">
            <p className="text-sm font-bold leading-tight">{session.name}</p>
            <p className="text-[11px] uppercase tracking-wide text-blue-100">{session.role === "admin" ? "Administrator" : "Staff"}</p>
          </div>
          <button
            type="button"
            onClick={onChangePassword}
            aria-label="Change password"
            title="Change password"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20"
          >
            <KeyIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white/10 px-4 py-2.5 text-xs font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ info, name }: { info: RatesInfo | null; name: string }) {
  const stats: [string, string][] = info
    ? [
        [String(info.couriers), "Couriers"],
        [String(info.services), "Services"],
        [String(info.destinations), "Destinations"],
      ]
    : [];

  return (
    <section className="relative mb-7 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-blue to-brand-navy px-6 py-7 text-white shadow-[0_18px_45px_rgba(7,27,85,0.18)] sm:px-9 sm:py-9">
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border-[40px] border-white/5" />
      <div className="absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-brand-red/20 blur-2xl" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-blue-100">
            <span className="h-0.5 w-7 bg-brand-red" />
            {name ? `Welcome, ${name.split(" ")[0]}` : "Fast, clear, dependable"}
          </div>
          <h1 className="text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-4xl">
            The smarter way to ship
            <span className="text-red-400"> from Malaysia to the world.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100 sm:text-base">
            Compare courier partners, see transparent pricing, and choose the right service in seconds.
          </p>
        </div>

        {stats.length > 0 && (
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm lg:min-w-[360px]">
            {stats.map(([value, label]) => (
              <div key={label} className="bg-white/8 px-4 py-4 text-center">
                <strong className="block text-xl font-extrabold">{value}</strong>
                <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-blue-100">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [loginNotice, setLoginNotice] = useState<Notice>(null);
  const [screen, setScreen] = useState<"landing" | "login">("landing");
  const [tab, setTab] = useState<Tab>(() => (readSession()?.role === "admin" ? "dashboard" : "calculator"));
  const [ratesVersion, setRatesVersion] = useState(0);
  const [info, setInfo] = useState<RatesInfo | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const signIn = (token: string) => {
    localStorage.setItem("token", token);
    const next = readSession();
    setLoginNotice(null);
    setSession(next);
    setTab(next?.role === "admin" ? "dashboard" : "calculator");
  };

  const signOut = (notice: Notice = null) => {
    localStorage.removeItem("token");
    setSession(null);
    setInfo(null);
    setLoginNotice(notice);
    setScreen(notice ? "login" : "landing"); // an expired session goes straight to the login form
  };

  // If the server says the session has ended, go back to the login page
  useEffect(() => {
    const onExpired = () => signOut({ type: "error", text: "Your session has ended. Please sign in again." });
    window.addEventListener("auth-expired", onExpired);
    return () => window.removeEventListener("auth-expired", onExpired);
  }, []);

  // Refresh the header/hero numbers after login and whenever the rate card changes
  const loggedIn = session !== null;
  useEffect(() => {
    if (!loggedIn) return;
    api<RatesInfo>("/api/rates-info")
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [ratesVersion, loggedIn]);

  if (!session) {
    return screen === "landing" ? (
      <Landing onSignIn={() => setScreen("login")} />
    ) : (
      <LoginPage onSignIn={signIn} onBack={() => setScreen("landing")} notice={loginNotice} />
    );
  }

  const isAdmin = session.role === "admin";
  const current: Tab = isAdmin ? tab : "calculator"; // staff only ever see the calculator

  return (
    <div className="min-h-screen bg-brand-ice text-slate-950">
      <Header info={info} session={session} onChangePassword={() => setChangingPassword(true)} onSignOut={() => signOut()} />

      <main className="panel-glow mx-auto max-w-[1180px] px-4 py-7 sm:px-8 sm:py-10">
        {current === "calculator" && <Hero info={info} name={session.name} />}

        {isAdmin && (
          <nav
            aria-label="Admin sections"
            className="mb-7 flex w-full gap-1.5 overflow-x-auto rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_6px_24px_rgba(7,27,85,0.07)]"
          >
            {ADMIN_TABS.map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                aria-current={current === id ? "page" : undefined}
                onClick={() => setTab(id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
                  current === id
                    ? "bg-brand-blue text-white shadow-[0_5px_14px_rgba(11,60,145,0.25)]"
                    : "text-slate-600 hover:bg-brand-ice hover:text-brand-navy"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </nav>
        )}

        {current === "calculator" && <Calculator key={ratesVersion} />}
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <Spinner className="border-brand-blue/30 border-t-brand-blue" />
            </div>
          }
        >
          {current === "dashboard" && <Dashboard onOpenRateCards={() => setTab("rates")} />}
          {current === "history" && <History />}
          {current === "rates" && <RateCards onChanged={() => setRatesVersion((v) => v + 1)} />}
          {current === "users" && <Users />}
          {current === "settings" && <SettingsPage />}
          {current === "activity" && <ActivityPage />}
        </Suspense>
      </main>

      <footer className="no-print border-t border-blue-100 py-6 text-center text-xs font-medium text-slate-500">
        CARSEM SHIPPING COURIER COMPARISON | WAFIY 2026
      </footer>

      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
