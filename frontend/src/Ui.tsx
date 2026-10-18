import { useEffect } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import carsemLogo from "./assets/carsem-logo.png";

// ---------------------------------------------------------------------------
// Shared building blocks used across the app
// (change a colour or an icon here and it updates everywhere)
// ---------------------------------------------------------------------------
export type Notice = { type: "success" | "error"; text: string } | null;
export type IconProps = { className?: string };

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
export const panel =
  "relative overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_12px_35px_rgba(7,27,85,0.08)]";
export const inputCls =
  "h-12 w-full rounded-xl border border-blue-100 bg-brand-ice/40 px-4 text-[15px] outline-none transition hover:border-blue-200 focus:border-brand-blue focus:bg-white focus:ring-4 focus:ring-blue-100";
export const selectCls = `${inputCls} appearance-none pr-10`;
export const redBtn =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-red px-6 text-sm font-bold text-white shadow-[0_7px_18px_rgba(237,41,36,0.24)] transition hover:-translate-y-0.5 hover:bg-brand-red-dark hover:shadow-[0_10px_22px_rgba(237,41,36,0.3)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none";
export const secondaryBtn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-4 text-sm font-bold text-brand-blue transition hover:border-brand-blue hover:bg-brand-ice disabled:cursor-not-allowed disabled:opacity-50";
export const smallBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-blue-100 bg-white px-3 text-xs font-bold text-brand-blue transition hover:border-brand-blue hover:bg-brand-ice disabled:cursor-not-allowed disabled:opacity-50";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
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

function Icon({ className = "h-5 w-5", d }: IconProps & { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export const ChartIcon = (p: IconProps) => <Icon {...p} d="M4 20V4m0 16h16M8 16v-5m4 5V8m4 8v-3" />;
export const HistoryIcon = (p: IconProps) => <Icon {...p} d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4m4-1v5l3 2" />;
export const TableIcon = (p: IconProps) => <Icon {...p} d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14" />;
export const UsersIcon = (p: IconProps) => (
  <Icon {...p} d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m6.5-9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19v-1a4 4 0 0 0-3-3.9M15.5 3.1a3.5 3.5 0 0 1 0 6.8" />
);
export const SettingsIcon = (p: IconProps) => (
  <Icon {...p} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z" />
);
export const ActivityIcon = (p: IconProps) => <Icon {...p} d="M3 12h4l3-8 4 16 3-8h4" />;
export const DownloadIcon = (p: IconProps) => <Icon {...p} d="M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5M5 20h14" />;
export const PrinterIcon = (p: IconProps) => (
  <Icon {...p} d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z" />
);
export const PlusIcon = (p: IconProps) => <Icon {...p} d="M12 5v14M5 12h14" />;
export const TrashIcon = (p: IconProps) => <Icon {...p} d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />;
export const CloseIcon = (p: IconProps) => <Icon {...p} d="m6 6 12 12M18 6 6 18" />;
export const KeyIcon = (p: IconProps) => <Icon {...p} d="M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-3 3v9m0-4h3m-3 2h2" />;
export const AlertIcon = (p: IconProps) => (
  <Icon {...p} d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
);

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------
export function Spinner({ className = "border-white/40 border-t-white" }: { className?: string }) {
  return <span className={`h-4 w-4 animate-spin rounded-full border-2 ${className}`} />;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-2 block text-sm font-semibold text-slate-700">{children}</label>;
}

/** Label + input wrapper used in forms. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

/** Native select with the brand chevron. */
export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`${selectCls} ${className}`} />
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M5.3 7.7a1 1 0 0 1 1.4 0l3.3 3.3 3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" clipRule="evenodd" />
      </svg>
    </div>
  );
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

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "red" | "blue" | "green" | "amber" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    red: "bg-brand-red text-white",
    blue: "bg-blue-50 text-brand-blue",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

// Courier badge colour, chosen by name or carrier code (falls back to slate for new couriers)
const accents: Record<string, string> = { dhl: "#071b55", fedex: "#0b3c91", fdx: "#0b3c91", ups: "#ed2924" };
export function accentFor(name: string) {
  const key = Object.keys(accents).find((k) => name.toLowerCase().includes(k));
  return key ? accents[key] : "#475569";
}

export function CourierMark({ name, size = "h-10 w-10" }: { name: string; size?: string }) {
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-xl text-sm font-black text-white shadow-sm`}
      style={{ backgroundColor: accentFor(name) }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-blue-200 bg-brand-ice/50 px-6 py-12 text-center">
      <p className="font-bold text-slate-700">{title}</p>
      {text && <p className="mt-1 text-sm text-slate-500">{text}</p>}
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-4 text-sm text-slate-500">
      <button type="button" className={smallBtn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="px-2">
        Page <strong className="text-slate-800">{page}</strong> of {pages}
      </span>
      <button type="button" className={smallBtn} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
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

/** White panel with the brand top bar and a title area. */
export function Card({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "p-5 sm:p-7",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`${panel} ${className}`}>
      <TopBar />
      <div className="flex flex-col gap-3 border-b border-blue-50 bg-gradient-to-r from-white to-brand-ice px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-7">
        <div>
          {eyebrow && (
            <div className="mb-1 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-red">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />
              {eyebrow}
            </div>
          )}
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-brand-navy">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children !== undefined && <div className={bodyClassName}>{children}</div>}
    </section>
  );
}

/** Pop-up dialog. Rendered at the end of <body> so it can be printed on its own. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  actions?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-root fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-navy/50 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel relative w-full ${wide ? "max-w-4xl" : "max-w-lg"} overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(7,27,85,0.35)]`}
      >
        <div className="no-print flex items-center justify-between gap-3 border-b border-blue-50 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-extrabold text-brand-navy">{title}</h2>
          <div className="flex items-center gap-2">
            {actions}
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-brand-ice hover:text-brand-navy">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="modal-body p-5 sm:p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
