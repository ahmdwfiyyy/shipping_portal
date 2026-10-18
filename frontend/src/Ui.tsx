import type { ReactNode } from "react";
import carsemLogo from "./assets/carsem-logo.png";

// ---------------------------------------------------------------------------
// Shared building blocks used by App.tsx and Landing.tsx
// (change a colour or an icon here and it updates everywhere)
// ---------------------------------------------------------------------------
export type Notice = { type: "success" | "error"; text: string } | null;
export type IconProps = { className?: string };

// ---------------------------------------------------------------------------
// Shared styles and small pieces
// ---------------------------------------------------------------------------
export const panel =
  "relative overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_12px_35px_rgba(7,27,85,0.08)]";
export const inputCls =
  "h-12 w-full rounded-xl border border-blue-100 bg-brand-ice/40 px-4 text-[15px] outline-none transition hover:border-blue-200 focus:border-brand-blue focus:bg-white focus:ring-4 focus:ring-blue-100";
export const redBtn =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-red px-6 text-sm font-bold text-white shadow-[0_7px_18px_rgba(237,41,36,0.24)] transition hover:-translate-y-0.5 hover:bg-brand-red-dark hover:shadow-[0_10px_22px_rgba(237,41,36,0.3)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none";

export function CalculatorIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01" strokeLinecap="round" />
    </svg>
  );
}

export function UploadIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="m5 12 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ScaleIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 4v16M7 20h10M5 8l7-2 7 2M5 8l-2.5 6a3 3 0 0 0 5 0L5 8Zm14 0-2.5 6a3 3 0 0 0 5 0L19 8Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShieldIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Zm-3 9 2.2 2.2L15 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" strokeLinecap="round" />
    </svg>
  );
}

export function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-2 block text-sm font-semibold text-slate-700">{children}</label>;
}

export function TopBar() {
  return <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-red via-brand-bright to-brand-navy" />;
}

export function Banner({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const style =
    notice.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";
  return (
    <div role="alert" className={`mb-5 rounded-xl border px-4 py-3 text-sm font-medium ${style}`}>
      {notice.text}
    </div>
  );
}

// Logo + portal name, used in the app header and on the landing page
export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-[0_6px_16px_rgba(0,0,0,0.2)] ring-2 ring-white/20">
        <img src={carsemLogo} alt="Carsem" draggable={false} className="h-9 w-9 select-none object-contain" />
      </div>
      <div>
        <p className="text-lg font-extrabold tracking-[-0.02em] sm:text-xl">CARSEM SHIPPING PORTAL</p>
        <p className="hidden text-xs font-medium tracking-wide text-blue-100 sm:block">Courier Rate Comparison</p>
      </div>
    </div>
  );
}
