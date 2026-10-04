import { useEffect, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from "react";
import carsemLogo from "./assets/carsem-logo.png";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Result = {
  courier: string;
  zone_code: string;
  chargeable_weight: number;
  incremental_steps: number;
  total_cost: number;
  is_cheapest: boolean;
};

type Notice = { type: "success" | "error"; text: string } | null;
type IconProps = { className?: string };

// ---------------------------------------------------------------------------
// API helper - talks to the FastAPI backend (/api is proxied in dev and in nginx)
// ---------------------------------------------------------------------------
class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data.detail === "string" ? data.detail : "Please check your inputs";
    throw new ApiError(message, res.status);
  }
  return data as T;
}

const errorText = (err: unknown) =>
  err instanceof Error ? err.message : "Something went wrong";

// ---------------------------------------------------------------------------
// Shared styles and small pieces
// ---------------------------------------------------------------------------
const card =
  "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]";
const inputCls =
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-[15px] outline-none transition focus:border-[#075bd4] focus:ring-4 focus:ring-blue-100";
const primaryBtn =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#075bd4] px-6 text-sm font-bold text-white shadow-[0_6px_16px_rgba(7,91,212,0.22)] transition hover:-translate-y-0.5 hover:bg-[#064ead] hover:shadow-[0_9px_20px_rgba(7,91,212,0.28)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none";

function CalculatorIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="m5 12 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-2 block text-sm font-semibold text-slate-700">{children}</label>;
}

function CardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
      <h1 className="text-xl font-bold tracking-[-0.02em] text-[#182e50]">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function Banner({ notice }: { notice: Notice }) {
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

// Courier badge colour, chosen by name (falls back to slate for new couriers)
const accents: Record<string, string> = { skynet: "#ef6a38", ninja: "#e73d4b", dhl: "#d6a700" };
function accentFor(name: string) {
  const key = Object.keys(accents).find((k) => name.toLowerCase().includes(k));
  return key ? accents[key] : "#475569";
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function Header({ ratesVersion }: { ratesVersion: number }) {
  const [updated, setUpdated] = useState("");

  // Re-fetch the date whenever a new rate card is uploaded (ratesVersion changes)
  useEffect(() => {
    api<{ last_updated: string }>("/api/rates-info")
      .then((d) =>
        setUpdated(
          new Date(d.last_updated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        ),
      )
      .catch(() => setUpdated(""));
  }, [ratesVersion]);

  return (
    <header className="bg-[#182e50] text-white shadow-[0_1px_0_rgba(255,255,255,0.06)]">
      <div className="mx-auto flex h-[76px] max-w-[1180px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-sm">
            <img src={carsemLogo} alt="Carsem" draggable={false} className="h-8 w-8 select-none object-contain" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-[-0.02em] sm:text-xl">Shipping Rate Portal</p>
            <p className="hidden text-xs text-slate-300 sm:block">Malaysia domestic delivery</p>
          </div>
        </div>

        {updated && (
          <div className="hidden items-center gap-2 rounded-full bg-white/8 px-3 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]" />
            Rates updated {updated}
          </div>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Rate calculator (public)
// ---------------------------------------------------------------------------
type FormKey = "length" | "width" | "height" | "weight";
const sizeFields: [FormKey, string, string][] = [
  ["length", "Length", "cm"],
  ["width", "Width", "cm"],
  ["height", "Height", "cm"],
  ["weight", "Actual weight", "kg"],
];

function Calculator() {
  const [destinations, setDestinations] = useState<string[]>([]);
  const [form, setForm] = useState({ destination: "", length: "", width: "", height: "", weight: "" });
  const [results, setResults] = useState<Result[] | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ destinations: string[] }>("/api/destinations")
      .then((d) => setDestinations(d.destinations))
      .catch(() => setError("Could not load destinations. Is the backend running?"));
  }, []);

  const length = Number(form.length);
  const width = Number(form.width);
  const height = Number(form.height);
  const weight = Number(form.weight);
  const cubic = length * width * height;
  const volumeLitres = cubic / 1000;
  const estChargeable = Math.max(weight, cubic / 5000);

  const compare = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api<{ results: Result[] }>("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: form.destination, length, width, height, actual_weight: weight }),
      });
      setResults(data.results);
      setSelected(data.results[0].courier);
    } catch (err) {
      setResults(null);
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  const chosen = results?.find((r) => r.courier === selected);

  return (
    <div className="space-y-6">
      <section className={card}>
        <CardHeader
          title="Compare shipping rates"
          subtitle="Enter your parcel details to find the best available courier rate."
        />

        <form onSubmit={compare} className="p-5 sm:p-7">
          {error && <Banner notice={{ type: "error", text: error }} />}

          <div>
            <FieldLabel>Destination</FieldLabel>
            <div className="relative">
              <select
                required
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                className={`${inputCls} appearance-none`}
              >
                <option value="">Select destination…</option>
                {destinations.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.3 7.7a1 1 0 0 1 1.4 0l3.3 3.3 3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" clipRule="evenodd" />
              </svg>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {sizeFields.map(([key, label, unit]) => (
              <div key={key}>
                <FieldLabel>{label}</FieldLabel>
                <div className="relative">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className={`${inputCls} pr-12`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{unit}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5 text-sm text-slate-500">
              <span>
                Volume <strong className="text-slate-800">{volumeLitres.toFixed(1)} L</strong>
              </span>
              <span className="h-4 w-px bg-slate-200" />
              <span>
                Est. chargeable <strong className="text-slate-800">{estChargeable.toFixed(1)} kg</strong>
              </span>
            </div>

            <button type="submit" disabled={loading} className={primaryBtn}>
              {loading ? (
                <>
                  <Spinner />
                  Comparing...
                </>
              ) : (
                <>
                  Compare rates
                  <ArrowIcon />
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {results && (
        <section className={`${card} animate-[fadein_0.4s_ease-out]`}>
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.01em] text-[#182e50]">Available rates</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {results.length} courier option{results.length === 1 ? "" : "s"} for {form.destination}
              </p>
            </div>
            <p className="text-xs font-medium text-slate-400">All prices in MYR</p>
          </div>

          <div className="space-y-3 p-4 sm:p-6">
            {results.map((rate) => {
              const isSelected = selected === rate.courier;
              return (
                <button
                  key={rate.courier}
                  type="button"
                  onClick={() => setSelected(rate.courier)}
                  className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border p-4 text-left transition-all sm:grid-cols-[auto_1.45fr_0.8fr_0.85fr_auto] sm:gap-5 sm:px-5 ${
                    isSelected
                      ? "border-[#075bd4] bg-blue-50/60 shadow-[0_5px_15px_rgba(7,91,212,0.08)]"
                      : "border-slate-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  }`}
                >
                  <span
                    className="grid h-10 w-10 place-items-center rounded-xl text-sm font-black text-white shadow-sm"
                    style={{ backgroundColor: accentFor(rate.courier) }}
                  >
                    {rate.courier.charAt(0).toUpperCase()}
                  </span>

                  <span>
                    <span className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                      {rate.courier}
                      {rate.is_cheapest && (
                        <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                          Best rate
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {rate.incremental_steps} extra 0.5 kg step{rate.incremental_steps === 1 ? "" : "s"}
                    </span>
                  </span>

                  <span className="hidden text-sm text-slate-600 sm:block">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Zone</span>
                    {rate.zone_code}
                  </span>

                  <span className="hidden text-sm text-slate-600 sm:block">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Chargeable</span>
                    {rate.chargeable_weight.toFixed(2)} kg
                  </span>

                  <span className="text-right">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total</span>
                    <span className="text-lg font-extrabold tabular-nums text-[#182e50]">RM {rate.total_cost.toFixed(2)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {chosen && (
            <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 text-sm sm:px-7">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckIcon className="h-3 w-3" />
              </span>
              <span className="text-slate-500">Selected:</span>
              <strong className="text-slate-800">{chosen.courier}</strong>
              <span className="text-slate-500">· RM {chosen.total_cost.toFixed(2)}</span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Admin rate upload (login required)
// ---------------------------------------------------------------------------
function Admin({ onUploaded }: { onUploaded: () => void }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const logout = (message: Notice = null) => {
    localStorage.removeItem("token");
    setToken(null);
    setFile(null);
    setNotice(message);
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      const data = await api<{ token: string }>("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      localStorage.setItem("token", data.token);
      setToken(data.token);
      setPassword("");
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const pickFile = (next?: File) => {
    if (!next) return;
    if (!/\.(xlsx|xls)$/i.test(next.name)) {
      setNotice({ type: "error", text: "Please choose an Excel file (.xlsx or .xls)." });
      return;
    }
    setNotice(null);
    setFile(next);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    pickFile(event.dataTransfer.files[0]);
  };

  const upload = async () => {
    if (!file) return;
    setNotice(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const data = await api<{ message: string }>("/api/upload-rates", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      setNotice({ type: "success", text: data.message });
      setFile(null);
      onUploaded();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout({ type: "error", text: "Session expired. Please log in again." });
      } else {
        setNotice({ type: "error", text: errorText(err) });
      }
    } finally {
      setBusy(false);
    }
  };

  // ---- Not logged in: show the admin login form
  if (!token) {
    return (
      <section className={`${card} max-w-md`}>
        <CardHeader title="Admin login" subtitle="Enter the admin password to update the rate card." />
        <form onSubmit={login} className="p-5 sm:p-7">
          <Banner notice={notice} />
          <FieldLabel>Password</FieldLabel>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
          <button type="submit" disabled={busy} className={`${primaryBtn} mt-6 w-full`}>
            {busy ? (
              <>
                <Spinner />
                Signing in...
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>
      </section>
    );
  }

  // ---- Logged in: upload screen
  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[#182e50]">Upload courier rates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Replace the current rates with an Excel file containing the sheets <strong>Zone_Mapping</strong> and{" "}
            <strong>Rates</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          Logout
        </button>
      </div>

      <div className="p-5 sm:p-7">
        <Banner notice={notice} />

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 text-center transition ${
            isDragging
              ? "border-[#075bd4] bg-blue-50"
              : file
                ? "border-emerald-300 bg-emerald-50/50"
                : "border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40"
          }`}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e: ChangeEvent<HTMLInputElement>) => pickFile(e.target.files?.[0])}
          />

          <span
            className={`mb-4 grid h-14 w-14 place-items-center rounded-2xl ${
              file ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-[#075bd4]"
            }`}
          >
            {file ? <CheckIcon className="h-7 w-7" /> : <UploadIcon className="h-7 w-7" />}
          </span>

          <span className="font-bold text-slate-800">{file ? file.name : "Drop your rate sheet here"}</span>
          <span className="mt-2 text-sm text-slate-500">
            {file ? `${(file.size / 1024).toFixed(1)} KB · Ready to upload` : "or click to browse your files · Excel .xlsx or .xls"}
          </span>
        </label>

        <div className="mt-6 flex justify-end">
          <button type="button" disabled={!file || busy} onClick={upload} className={primaryBtn}>
            {busy ? (
              <>
                <Spinner />
                Uploading...
              </>
            ) : (
              <>
                <UploadIcon />
                Upload new Excel card
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------
export default function App() {
  const [activeTab, setActiveTab] = useState<"calculator" | "upload">("calculator");
  const [ratesVersion, setRatesVersion] = useState(0);

  const tab = (id: "calculator" | "upload", label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition-all sm:flex-none ${
        activeTab === id
          ? "bg-[#075bd4] text-white shadow-[0_5px_14px_rgba(7,91,212,0.25)]"
          : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-slate-950">
      <Header ratesVersion={ratesVersion} />

      <main className="mx-auto max-w-[1180px] px-4 py-7 sm:px-8 sm:py-10">
        <div className="mb-7 flex w-full gap-2 rounded-xl bg-slate-200/70 p-1.5 sm:w-fit">
          {tab("calculator", "Rate Calculator", <CalculatorIcon />)}
          {tab("upload", "Admin Rate Upload", <UploadIcon />)}
        </div>

        {activeTab === "calculator" ? <Calculator /> : <Admin onUploaded={() => setRatesVersion((v) => v + 1)} />}
      </main>
    </div>
  );
}
