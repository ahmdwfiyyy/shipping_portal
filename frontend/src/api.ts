// ---------------------------------------------------------------------------
// Talking to the FastAPI backend (/api is proxied in dev, by nginx in Docker and by Vercel)
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function authHeaders(init?: HeadersInit) {
  const headers = new Headers(init);
  const token = localStorage.getItem("token");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

async function failure(res: Response, path: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  // An expired or invalid session anywhere (except the login form itself) sends the person back to sign in
  if (res.status === 401 && path !== "/api/login") window.dispatchEvent(new Event("auth-expired"));
  const detail = data?.detail;
  const message =
    typeof detail === "string"
      ? detail
      : Array.isArray(detail) && detail[0]?.msg
        ? String(detail[0].msg).replace(/^Value error, /, "")
        : "Please check your inputs";
  throw new ApiError(message, res.status);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: authHeaders(init?.headers) });
  if (!res.ok) return failure(res, path);
  return (await res.json()) as T;
}

export const postJson = <T>(path: string, body: unknown, method = "POST") =>
  api<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Download a file from a protected endpoint (a plain link would not send the login token). */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) return failure(res, path);
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");

/** Build a query string, leaving out empty values. */
export function query(params: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// Session: the login token is kept in localStorage; the server checks it on every request.
// Reading the role here only decides what the screen shows - it is not a security check.
// ---------------------------------------------------------------------------
export type Role = "admin" | "staff";
export type Session = { token: string; role: Role; name: string };

export function readSession(): Session | null {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) throw new Error("expired");
    return { token, role: payload.role === "admin" ? "admin" : "staff", name: String(payload.name ?? "") };
  } catch {
    localStorage.removeItem("token");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shapes returned by the API
// ---------------------------------------------------------------------------
export type Destination = { name: string; services: number };

export type RatesInfo = {
  last_updated: string;
  couriers: number;
  services: number;
  destinations: number;
  fuel: Record<string, number>;
};

export type Piece = { length: number; width: number; height: number; weight: number; quantity: number };

export type Summary = {
  pieces: number;
  cbm: number;
  actual_weight: number;
  volumetric_weight: number;
  chargeable_weight: number;
};

export type Result = {
  courier: string; // service name, e.g. "DHL Express"
  carrier: string;
  service_key: string;
  zone_code: string;
  container: string; // "Pkg" (parcel) or "Pal" (pallet freight)
  billed_weight: number;
  rate_type: "per_shipment" | "per_kg";
  rate_per_kg: number | null;
  base_cost: number;
  fuel_pct: number;
  fuel_surcharge: number;
  total_cost: number;
  is_cheapest: boolean;
};

export type QuoteSummary = {
  id: number;
  reference_no: string;
  created_at: string;
  staff_name: string;
  destination: string;
  total_pieces: number;
  cbm: number;
  actual_weight: number;
  volumetric_weight: number;
  chargeable_weight: number;
  selected_service: string;
  selected_carrier: string;
  selected_total: number;
  cheapest_total: number;
  highest_total: number;
  customer_ref: string;
  remarks: string;
};

export type Quote = QuoteSummary & { pieces: Piece[]; results: Result[] };

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const money = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rm = (n: number) => `RM ${money.format(n)}`;
export const num = (n: number, digits = 2) =>
  n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: digits });

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const CARRIER_NAMES: Record<string, string> = { DHL: "DHL", FDX: "FedEx", UPS: "UPS" };
export const carrierName = (code: string) => CARRIER_NAMES[code] ?? code;

/** Today in local time as YYYY-MM-DD (for date inputs). */
export function isoDay(d: Date = new Date()) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
