import { useEffect, useState } from "react";
import type { Quote, QuoteSummary } from "../api";
import { api, carrierName, download, errorText, fmtDateTime, query, rm } from "../api";
import QuoteSheet from "../QuoteSheet";
import {
  Banner,
  Card,
  CourierMark,
  DownloadIcon,
  EmptyState,
  Field,
  Modal,
  Pager,
  PrinterIcon,
  SearchIcon,
  Select,
  Spinner,
  inputCls,
  secondaryBtn,
  smallBtn,
} from "../Ui";

type Page = { items: QuoteSummary[]; total: number; page: number; pages: number; staff_options: string[] };
type Filters = { q: string; date_from: string; date_to: string; carrier: string; staff: string };
const noFilters: Filters = { q: "", date_from: "", date_to: "", carrier: "", staff: "" };

// ---------------------------------------------------------------------------
// Admin: every comparison staff submitted, with search, filters and Excel export
// ---------------------------------------------------------------------------
export default function History() {
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [search, setSearch] = useState(""); // typed text, applied after a short pause
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState<Quote | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => {
        if (f.q === search) return f;
        setPage(1);
        return { ...f, q: search };
      });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    api<Page>(`/api/admin/quotes${query({ ...filters, page })}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, [filters, page]);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      await download(`/api/admin/quotes/export${query(filters)}`, "quote-history.xlsx");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setExporting(false);
    }
  };

  const openQuote = async (id: number) => {
    try {
      setOpen(await api<Quote>(`/api/admin/quotes/${id}`));
    } catch (err) {
      setError(errorText(err));
    }
  };

  const filtered = Object.values(filters).some(Boolean);

  return (
    <Card
      eyebrow="Admin"
      title="Quote history"
      description="Every rate comparison submitted by staff. Prices are as they were when submitted."
      actions={
        <button type="button" className={secondaryBtn} onClick={exportExcel} disabled={exporting || !data?.total}>
          {exporting ? <Spinner className="border-brand-blue/30 border-t-brand-blue" /> : <DownloadIcon className="h-4 w-4" />}
          Export to Excel
        </button>
      }
    >
      <Banner notice={error ? { type: "error", text: error } : null} />

      {/* Filters */}
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <Field label="Search">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Reference, destination, staff, customer ref…"
              className={`${inputCls} pl-11`}
            />
          </div>
        </Field>
        <Field label="From">
          <input type="date" value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} className={inputCls} />
        </Field>
        <Field label="To">
          <input type="date" value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Carrier">
          <Select value={filters.carrier} onChange={(e) => setFilter("carrier", e.target.value)}>
            <option value="">All carriers</option>
            <option value="DHL">DHL</option>
            <option value="FDX">FedEx</option>
            <option value="UPS">UPS</option>
          </Select>
        </Field>
        <Field label="Staff">
          <Select value={filters.staff} onChange={(e) => setFilter("staff", e.target.value)}>
            <option value="">All staff</option>
            {data?.staff_options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          {loading ? "Loading…" : `${data?.total ?? 0} quote${data?.total === 1 ? "" : "s"}`}
          {filtered && " matching the filters"}
        </span>
        {filtered && (
          <button
            type="button"
            className="font-bold text-brand-blue hover:text-brand-red"
            onClick={() => {
              setSearch("");
              setFilters(noFilters);
              setPage(1);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="mt-3">
        {data && data.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No quotes match these filters" : "No quotes yet"}
            text={filtered ? "Try a wider date range or clear the filters." : "Quotes appear here when staff submit a comparison."}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-blue-50">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="bg-brand-ice text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Date · staff</th>
                  <th className="px-4 py-3 font-semibold">Destination</th>
                  <th className="px-4 py-3 font-semibold">Selected service</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className={loading ? "opacity-50" : ""}>
                {data?.items.map((q) => (
                  <tr key={q.id} className="border-t border-blue-50 hover:bg-brand-ice/40">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="block font-bold text-brand-navy">{q.reference_no}</span>
                      <span className="block text-xs text-slate-400">{q.customer_ref || "No customer ref"}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="block text-slate-700">{fmtDateTime(q.created_at)}</span>
                      <span className="block text-xs text-slate-400">{q.staff_name}</span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-slate-700">{q.destination}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <CourierMark name={q.selected_carrier} size="h-7 w-7 text-xs" />
                        <span>
                          <span className="block font-semibold leading-5 text-slate-800">{q.selected_service}</span>
                          <span className="block text-xs text-slate-400">
                            {carrierName(q.selected_carrier)}
                            {q.selected_total <= q.cheapest_total + 0.005 ? " · lowest price" : ""}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-brand-navy">{rm(q.selected_total)}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" className={smallBtn} onClick={() => openQuote(q.id)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>

      {open && (
        <Modal
          title={`Quotation ${open.reference_no}`}
          wide
          onClose={() => setOpen(null)}
          actions={
            <button type="button" className={secondaryBtn} onClick={() => window.print()}>
              <PrinterIcon className="h-4 w-4" />
              Print / Save as PDF
            </button>
          }
        >
          <QuoteSheet quote={open} />
        </Modal>
      )}
    </Card>
  );
}
