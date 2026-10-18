import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import carsemLogo from "./assets/carsem-logo.png";
import Landing from "./Landing";
import {
  ArrowIcon,
  Banner,
  Brand,
  CalculatorIcon,
  CheckIcon,
  FieldLabel,
  SearchIcon,
  Spinner,
  TopBar,
  UploadIcon,
  inputCls,
  panel,
  redBtn,
} from "./Ui";
import type { Notice } from "./Ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Result = {
  courier: string; // service name, e.g. "DHL Express"
  carrier: string;
  service_key: string;
  zone_code: string;
  container: string; // "Pkg" (parcel) or "Pal" (pallet freight)
  chargeable_weight: number;
  billed_weight: number;
  rate_type: "per_shipment" | "per_kg";
  rate_per_kg: number | null;
  total_cost: number;
  is_cheapest: boolean;
};

type Destination = { name: string; services: number };

type RatesInfo = { last_updated: string; couriers: number; services: number; destinations: number };

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
  const headers = new Headers(init?.headers);
  const token = localStorage.getItem("token");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // An expired or invalid token anywhere (except the login form itself) sends the person back to the login page
    if (res.status === 401 && path !== "/api/login") window.dispatchEvent(new Event("auth-expired"));
    const message = typeof data.detail === "string" ? data.detail : "Please check your inputs";
    throw new ApiError(message, res.status);
  }
  return data as T;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");

// ---------------------------------------------------------------------------
// Session: the login token is kept in localStorage; the server checks it on every request.
// Reading the role here only decides what the screen shows - it is not a security check.
// ---------------------------------------------------------------------------
type Role = "admin" | "user";
type Session = { token: string; role: Role };

function readSession(): Session | null {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) throw new Error("expired");
    return { token, role: payload.role === "admin" ? "admin" : "user" };
  } catch {
    localStorage.removeItem("token");
    return null;
  }
}

// Courier badge colour, chosen by name (falls back to slate for new couriers)
const accents: Record<string, string> = { dhl: "#071b55", fedex: "#0b3c91", ups: "#ed2924" };
function accentFor(name: string) {
  const key = Object.keys(accents).find((k) => name.toLowerCase().includes(k));
  return key ? accents[key] : "#475569";
}

// ---------------------------------------------------------------------------
// Header and hero
// ---------------------------------------------------------------------------
function Header({ info, role, onSignOut }: { info: RatesInfo | null; role: Role; onSignOut: () => void }) {
  const updated = info
    ? new Date(info.last_updated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";

  return (
    <header className="brand-grid relative overflow-hidden bg-brand-navy text-white shadow-[0_8px_30px_rgba(7,27,85,0.18)]">
      <div className="brand-ribbon pointer-events-none absolute -right-16 -top-32 h-80 w-96 opacity-80" />
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-brand-red via-white to-brand-bright" />

      <div className="relative mx-auto flex h-[84px] max-w-[1180px] items-center justify-between px-5 sm:px-8">
        <Brand />

        <div className="flex items-center gap-3">
          {updated && (
            <div className="hidden items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-xs font-bold text-white ring-1 ring-white/20 backdrop-blur-sm md:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                <span className="relative h-2 w-2 rounded-full bg-brand-red" />
              </span>
              Rates updated {updated}
            </div>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-xs font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20"
          >
            {role === "admin" && (
              <span className="rounded bg-brand-red px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Admin</span>
            )}
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ info }: { info: RatesInfo | null }) {
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
            Fast, clear, dependable
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
// Destination search box: type to filter, arrow keys + Enter to pick
// ---------------------------------------------------------------------------
function DestinationSearch({
  options,
  value,
  onChange,
}: {
  options: Destination[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Countries starting with the search text come first, then any that contain it
  const q = query.trim().toLowerCase();
  const matches = q
    ? [
        ...options.filter((o) => o.name.toLowerCase().startsWith(q)),
        ...options.filter((o) => !o.name.toLowerCase().startsWith(q) && o.name.toLowerCase().includes(q)),
      ]
    : options;

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (name: string) => {
    setQuery(name);
    onChange(name);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (matches.length ? (i + step + matches.length) % matches.length : 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault(); // pick the highlighted country instead of submitting the form
      pick(matches[active].name);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        required
        role="combobox"
        aria-expanded={open}
        aria-controls="destination-list"
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `destination-${active}` : undefined}
        autoComplete="off"
        placeholder={options.length ? `Search ${options.length} countries…` : "Search countries…"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
          // Only a name picked from the list counts, unless the text matches one exactly
          const exact = options.find((o) => o.name.toLowerCase() === e.target.value.trim().toLowerCase());
          onChange(exact ? exact.name : "");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={`${inputCls} pl-11`}
      />

      {open && (
        <ul
          id="destination-list"
          role="listbox"
          ref={listRef}
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-blue-100 bg-white py-1.5 shadow-[0_12px_35px_rgba(7,27,85,0.15)]"
        >
          {matches.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">No country matches "{query.trim()}"</li>
          ) : (
            matches.map((o, i) => (
              <li
                key={o.name}
                id={`destination-${i}`}
                role="option"
                aria-selected={o.name === value}
                // mousedown fires before the input's blur, so the click is not lost
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o.name);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm ${
                  i === active ? "bg-brand-ice text-brand-navy" : "text-slate-700"
                }`}
              >
                <span className={o.name === value ? "font-bold" : "font-medium"}>{o.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {o.services} service{o.services === 1 ? "" : "s"}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Rate calculator (any signed-in user)
// ---------------------------------------------------------------------------
type FormKey = "length" | "width" | "height" | "weight";
const sizeFields: [FormKey, string, string][] = [
  ["length", "Length", "m"],
  ["width", "Width", "m"],
  ["height", "Height", "m"],
  ["weight", "Actual weight", "kg"],
];

function Calculator() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [form, setForm] = useState({ destination: "", length: "", width: "", height: "", weight: "" });
  const [results, setResults] = useState<Result[] | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ destinations: Destination[] }>("/api/destinations")
      .then((d) => setDestinations(d.destinations))
      .catch(() => setError("Could not load destinations. Is the backend running?"));
  }, []);

  const length = Number(form.length);
  const width = Number(form.width);
  const height = Number(form.height);
  const weight = Number(form.weight);
  const cbm = length * width * height; // sizes are in metres, so this is m³
  const chargeable = Math.max(weight, cbm * 200); // same as cm³ / 5000

  const compare = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.destination) {
      setError("Please choose a destination from the list.");
      return;
    }
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
      <section className={panel}>
        <TopBar />
        <div className="border-b border-blue-50 bg-gradient-to-r from-white to-brand-ice px-5 py-5 sm:px-7">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-red">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />
            Shipment details
          </div>
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-brand-navy">Compare shipping rates</h2>
          <p className="mt-1 text-sm text-slate-500">Enter your parcel details to find the best available courier rate.</p>
        </div>

        <form onSubmit={compare} className="p-5 sm:p-7">
          <Banner notice={error ? { type: "error", text: error } : null} />

          <div>
            <FieldLabel>Destination</FieldLabel>
            <DestinationSearch
              options={destinations}
              value={form.destination}
              onChange={(destination) => setForm((f) => ({ ...f, destination }))}
            />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {sizeFields.map(([key, label, unit]) => (
              <div key={key}>
                <FieldLabel>{label}</FieldLabel>
                <div className="relative">
                  <input
                    type="number"
                    min={key === "weight" ? "0.1" : "0.01"}
                    step={key === "weight" ? "0.1" : "0.01"}
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
                CBM <strong className="text-slate-800">{cbm.toFixed(3)} m³</strong>
              </span>
              <span className="h-4 w-px bg-slate-200" />
              <span>
                Chargeable Weight <strong className="text-slate-800">{chargeable.toFixed(1)} kg</strong>
              </span>
            </div>

            <button type="submit" disabled={loading} className={redBtn}>
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
        <section className={`${panel} animate-[fadein_0.4s_ease-out]`}>
          <div className="flex flex-col gap-2 border-b border-blue-50 bg-gradient-to-r from-brand-navy to-brand-blue px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <h2 className="text-lg font-extrabold tracking-[-0.01em]">Available rates</h2>
              <p className="mt-0.5 text-sm text-blue-100">
                {results.length} courier option{results.length === 1 ? "" : "s"} for {form.destination}
              </p>
            </div>
            <p className="w-fit rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50 ring-1 ring-white/15">
              All prices in MYR
            </p>
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
                      ? "border-brand-blue bg-brand-ice shadow-[0_6px_18px_rgba(11,60,145,0.12)] ring-1 ring-brand-blue/10"
                      : "border-slate-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-brand-ice/40 hover:shadow-md"
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
                        <span className="rounded-full bg-brand-red px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm">
                          Best rate
                        </span>
                      )}
                      {rate.container === "Pal" && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                          Pallet freight
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {rate.rate_type === "per_kg"
                        ? `RM ${rate.rate_per_kg?.toFixed(2)}/kg × ${rate.billed_weight} kg`
                        : `Shipment rate for ${rate.billed_weight} kg`}
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
                    <span className="text-lg font-extrabold tabular-nums text-brand-navy">RM {rate.total_cost.toFixed(2)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {chosen && (
            <div className="flex items-center gap-2 border-t border-blue-50 bg-brand-ice px-5 py-4 text-sm sm:px-7">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-red text-white">
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
// Login page (opened from the landing page, or after a session expires)
// ---------------------------------------------------------------------------
function LoginPage({ onSignIn, onBack, notice }: { onSignIn: (token: string) => void; onBack: () => void; notice: Notice }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api<{ token: string }>("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      onSignIn(data.token);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="brand-grid relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-navy px-4 py-10">
      <div className="brand-ribbon pointer-events-none absolute -right-16 -top-32 h-80 w-96 opacity-80" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full border-[40px] border-white/5" />
      <div className="pointer-events-none absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-brand-red/20 blur-2xl" />
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-brand-red via-white to-brand-bright" />

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-[0_6px_16px_rgba(0,0,0,0.25)] ring-2 ring-white/20">
            <img src={carsemLogo} alt="Carsem" draggable={false} className="h-10 w-10 select-none object-contain" />
          </div>
          <div>
            <p className="text-xl font-extrabold tracking-[-0.02em]">Shipping Rate Portal</p>
            <p className="text-xs font-medium tracking-wide text-blue-100">International delivery from Malaysia</p>
          </div>
        </div>

        <section className={panel}>
          <TopBar />
          <div className="border-b border-blue-50 bg-gradient-to-r from-white to-brand-ice px-6 py-6">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-red">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />
              Secure access
            </div>
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-brand-navy">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to compare courier rates.</p>
          </div>

          <form onSubmit={submit} className="p-6">
            <Banner notice={error ? { type: "error", text: error } : notice} />

            <FieldLabel>Password</FieldLabel>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                required
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-20`}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-bold text-brand-blue hover:text-brand-red"
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>

            <button type="submit" disabled={busy} className={`${redBtn} mt-6 w-full`}>
              {busy ? (
                <>
                  <Spinner />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowIcon />
                </>
              )}
            </button>
          </form>
        </section>

        <div className="mt-5 text-center text-xs text-blue-100">
          <p>Need access? Ask your administrator for the password.</p>
          <button type="button" onClick={onBack} className="mt-3 font-bold text-white underline-offset-4 hover:underline">
            ← Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Admin rate upload (admin password required)
// ---------------------------------------------------------------------------
function Admin({
  session,
  onSignIn,
  onSignOut,
  onUploaded,
}: {
  session: Session;
  onSignIn: (token: string) => void;
  onSignOut: () => void;
  onUploaded: () => void;
}) {
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Staff who signed in with the site password must enter the admin password here
  const adminLogin = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      const data = await api<{ token: string; role: Role }>("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (data.role !== "admin") {
        setNotice({ type: "error", text: "That password does not have admin access." });
      } else {
        onSignIn(data.token);
        setPassword("");
      }
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
      const data = await api<{ message: string }>("/api/upload-rates", { method: "POST", body });
      setNotice({ type: "success", text: data.message });
      setFile(null);
      onUploaded();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  // ---- Not an admin yet: admin password form
  if (session.role !== "admin") {
    return (
      <section className={`${panel} max-w-md`}>
        <TopBar />
        <div className="border-b border-blue-50 bg-gradient-to-r from-white to-brand-ice px-5 py-5 sm:px-7">
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-brand-navy">Admin login</h2>
          <p className="mt-1 text-sm text-slate-500">Enter the admin password to update the rate card.</p>
        </div>
        <form onSubmit={adminLogin} className="p-5 sm:p-7">
          <Banner notice={notice} />
          <FieldLabel>Admin password</FieldLabel>
          <input
            type="password"
            required
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
          <button type="submit" disabled={busy} className={`${redBtn} mt-6 w-full`}>
            {busy ? (
              <>
                <Spinner />
                Checking...
              </>
            ) : (
              "Unlock admin"
            )}
          </button>
        </form>
      </section>
    );
  }

  // ---- Admin: upload screen
  return (
    <section className={panel}>
      <TopBar />
      <div className="flex items-start justify-between gap-4 border-b border-blue-50 bg-gradient-to-r from-white to-brand-ice px-5 py-5 sm:px-7">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-brand-navy">Upload courier rates</h2>
          <p className="mt-1 text-sm text-slate-500">
            Replace the current rates with an Excel file containing the sheets <strong>COUNTRY MAPPING</strong> and{" "}
            <strong>MASTER RATE</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="shrink-0 rounded-lg border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-brand-blue transition hover:border-brand-red hover:text-brand-red"
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
              ? "border-brand-blue bg-blue-50"
              : file
                ? "border-brand-red bg-red-50/50"
                : "border-blue-200 bg-brand-ice/50 hover:border-brand-blue hover:bg-blue-50/60"
          }`}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e: ChangeEvent<HTMLInputElement>) => pickFile(e.target.files?.[0])}
          />

          <span
            className={`mb-4 grid h-14 w-14 place-items-center rounded-2xl shadow-sm ${
              file ? "bg-red-100 text-brand-red" : "bg-brand-blue text-white"
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
          <button type="button" disabled={!file || busy} onClick={upload} className={redBtn}>
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
  const [session, setSession] = useState<Session | null>(readSession);
  const [loginNotice, setLoginNotice] = useState<Notice>(null);
  const [screen, setScreen] = useState<"landing" | "login">("landing");
  const [activeTab, setActiveTab] = useState<"calculator" | "upload">("calculator");
  const [ratesVersion, setRatesVersion] = useState(0);
  const [info, setInfo] = useState<RatesInfo | null>(null);

  const signIn = (token: string) => {
    localStorage.setItem("token", token);
    setLoginNotice(null);
    setSession(readSession());
  };

  const signOut = (notice: Notice = null) => {
    localStorage.removeItem("token");
    setSession(null);
    setInfo(null);
    setActiveTab("calculator");
    setLoginNotice(notice);
    setScreen(notice ? "login" : "landing"); // an expired session goes straight to the login form
  };

  // If the server says the token has expired, go back to the login page
  useEffect(() => {
    const onExpired = () => signOut({ type: "error", text: "Your session has expired. Please sign in again." });
    window.addEventListener("auth-expired", onExpired);
    return () => window.removeEventListener("auth-expired", onExpired);
  }, []);

  // Refresh the header/hero numbers after login and after every successful upload
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

  const tab = (id: "calculator" | "upload", label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition-all sm:flex-none ${
        activeTab === id
          ? "bg-brand-blue text-white shadow-[0_5px_14px_rgba(11,60,145,0.25)]"
          : "text-slate-600 hover:bg-brand-ice hover:text-brand-navy"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-brand-ice text-slate-950">
      <Header info={info} role={session.role} onSignOut={() => signOut()} />

      <main className="panel-glow mx-auto max-w-[1180px] px-4 py-7 sm:px-8 sm:py-10">
        <Hero info={info} />

        <div className="mb-7 flex w-full gap-2 rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_6px_24px_rgba(7,27,85,0.07)] sm:w-fit">
          {tab("calculator", "Rate Calculator", <CalculatorIcon />)}
          {tab("upload", "Admin Rate Upload", <UploadIcon />)}
        </div>

        {activeTab === "calculator" ? (
          <Calculator />
        ) : (
          <Admin
            session={session}
            onSignIn={signIn}
            onSignOut={() => signOut()}
            onUploaded={() => setRatesVersion((v) => v + 1)}
          />
        )}
      </main>
    </div>
  );
}