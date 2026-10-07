import type { ReactNode } from "react";
import carsemLogo from "./assets/carsem-logo.png";
import {
  ArrowIcon,
  CalculatorIcon,
  CheckIcon,
  ScaleIcon,
  ShieldIcon,
  TopBar,
  UploadIcon,
  panel,
  redBtn,
} from "./Ui";

// ---------------------------------------------------------------------------
// Landing page (public - shown before sign in)
// ---------------------------------------------------------------------------
export default function Landing({ onSignIn }: { onSignIn: () => void }) {
  const features: [ReactNode, string, string][] = [
    [
      <CalculatorIcon className="h-6 w-6" />,
      "Compare couriers side by side",
      "See every courier available for your destination in one list, ordered from the lowest price to the highest.",
    ],
    [
      <ScaleIcon className="h-6 w-6" />,
      "Chargeable weight, worked out for you",
      "Actual and volumetric weight are compared automatically, and the higher of the two is the one that gets priced.",
    ],
    [
      <CheckIcon className="h-6 w-6" />,
      "Best rate highlighted",
      "The lowest price is flagged for you, so the cheapest option is clear at a glance.",
    ],
    [
      <ArrowIcon className="h-6 w-6" />,
      "Priced by destination",
      "Pick the destination and the right zone rate is applied for every courier. No lookup tables needed.",
    ],
    [
      <UploadIcon className="h-6 w-6" />,
      "Rates that stay up to date",
      "Administrators replace the rate card by uploading an Excel file. The site picks it up straight away.",
    ],
    [
      <ShieldIcon className="h-6 w-6" />,
      "Private to your team",
      "Sign-in is required before anyone can see rates, and updating the rate card needs a separate admin password.",
    ],
  ];

  const steps: [string, string][] = [
    ["Sign in", "Use the password your administrator gave you."],
    ["Enter parcel details", "Choose the destination, then add the length, width, height and actual weight."],
    ["Compare and choose", "Review the price from every courier and pick the best option for the shipment."],
  ];

  return (
    <div className="min-h-screen bg-brand-ice text-slate-950">
      {/* ---------- Navigation + hero ---------- */}
      <section className="brand-grid relative overflow-hidden bg-brand-navy text-white shadow-[0_8px_30px_rgba(7,27,85,0.18)]">
        <div className="brand-ribbon pointer-events-none absolute -right-16 -top-32 h-80 w-96 opacity-80" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full border-[40px] border-white/5" />
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-brand-red via-white to-brand-bright" />

        <div className="relative mx-auto max-w-[1180px] px-5 sm:px-8">
          <nav className="flex h-[84px] items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-[0_6px_16px_rgba(0,0,0,0.2)] ring-2 ring-white/20">
                <img src={carsemLogo} alt="Carsem" draggable={false} className="h-9 w-9 select-none object-contain" />
              </div>
              <div>
                <p className="text-lg font-extrabold tracking-[-0.02em] sm:text-xl">CARSEM SHIPPING PORTAL</p>
                <p className="hidden text-xs font-medium tracking-wide text-blue-100 sm:block">COURIER RATE COMPARISON</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20"
            >
              Sign in
              <ArrowIcon />
            </button>
          </nav>

          <div className="grid items-center gap-12 pb-16 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-16">
            <div>
              <div className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-blue-100">
                <span className="h-0.5 w-7 bg-brand-red" />
                Fast, clear, dependable
              </div>
              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-[-0.04em] sm:text-5xl">
                The smarter way to ship
                <span className="text-red-400"> across Malaysia.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-blue-100 sm:text-lg">
                Compare courier partners, see transparent pricing, and choose the right service in seconds. All in one place.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={onSignIn} className={redBtn}>
                  Sign in to compare rates
                  <ArrowIcon />
                </button>
                <a
                  href="#how"
                  className="inline-flex h-12 items-center justify-center rounded-xl px-6 text-sm font-bold text-white ring-1 ring-white/30 transition hover:bg-white/10"
                >
                  How it works
                </a>
              </div>
            </div>

            {/* Explainer card (pure maths, no rates shown publicly) */}
            <div className={`${panel} p-6 text-slate-900 shadow-[0_24px_60px_rgba(0,0,0,0.3)] sm:p-7`}>
              <TopBar />
              <div className="mb-1 mt-1 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-red">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />
                How pricing works
              </div>
              <h2 className="text-xl font-extrabold tracking-[-0.02em] text-brand-navy">Chargeable weight, explained</h2>

              <div className="mt-5 space-y-3">
                <div className="rounded-xl border border-blue-100 bg-brand-ice/60 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Volumetric weight</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">Length × Width × Height ÷ 5000</p>
                </div>
                <div className="rounded-xl border border-blue-100 bg-brand-ice/60 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Chargeable weight</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">Whichever is higher: actual or volumetric</p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-brand-navy px-4 py-4 text-white">
                <div className="text-sm">
                  <p className="font-bold">40 × 30 × 30 cm box</p>
                  <p className="mt-0.5 text-xs text-blue-100">Actual 1.2 kg · volumetric 7.2 kg</p>
                </div>
                <span className="shrink-0 rounded-full bg-brand-red px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide">
                  Priced at 7.2 kg
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="panel-glow">
        <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20">
          <div className="mb-10 max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-brand-red">
              <span className="h-0.5 w-7 bg-brand-red" />
              Why use it
            </div>
            <h2 className="text-3xl font-extrabold tracking-[-0.03em] text-brand-navy sm:text-4xl">
              Everything you need to pick the right courier
            </h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(([icon, title, text]) => (
              <div
                key={title}
                className="rounded-2xl border border-blue-100 bg-white p-6 shadow-[0_8px_24px_rgba(7,27,85,0.06)] transition hover:-translate-y-1 hover:shadow-[0_14px_32px_rgba(7,27,85,0.12)]"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-blue text-white shadow-[0_6px_14px_rgba(11,60,145,0.25)]">
                  {icon}
                </span>
                <h3 className="mt-4 text-lg font-extrabold tracking-[-0.01em] text-brand-navy">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="scroll-mt-4 border-y border-blue-100 bg-white">
        <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20">
          <div className="mb-10 max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-brand-red">
              <span className="h-0.5 w-7 bg-brand-red" />
              How it works
            </div>
            <h2 className="text-3xl font-extrabold tracking-[-0.03em] text-brand-navy sm:text-4xl">
              From parcel details to the best rate in three steps
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {steps.map(([title, text], index) => (
              <div key={title} className="relative rounded-2xl border border-blue-100 bg-brand-ice/60 p-6">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-red text-base font-extrabold text-white shadow-[0_6px_14px_rgba(237,41,36,0.25)]">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-extrabold tracking-[-0.01em] text-brand-navy">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Call to action ---------- */}
      <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-blue to-brand-navy px-6 py-10 text-white shadow-[0_18px_45px_rgba(7,27,85,0.18)] sm:px-12 sm:py-12">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border-[40px] border-white/5" />
          <div className="absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-brand-red/20 blur-2xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="text-3xl font-extrabold leading-tight tracking-[-0.03em]">Ready to find your best rate?</h2>
              <p className="mt-2 text-blue-100">Sign in and compare every courier for your next shipment.</p>
            </div>
            <button type="button" onClick={onSignIn} className={`${redBtn} shrink-0`}>
              Sign in
              <ArrowIcon />
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-blue-100 py-8 text-center text-xs font-medium text-slate-500">
        CARSEM SHIPPING COURIER COMPARISON | WAFIY 2026
      </footer>
    </div>
  );
}