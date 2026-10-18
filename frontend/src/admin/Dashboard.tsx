import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, errorText, fmtDate, isoDay, num, query, rm } from "../api";
import { AlertIcon, Banner, EmptyState, panel, TopBar } from "../Ui";

// ---------------------------------------------------------------------------
// Chart colours. Single-series charts use one brand blue. Carriers keep a fixed colour each
// (validated for colour-blind separation: DHL yellow / FedEx blue / UPS red); yellow is below 3:1
// on white, so carrier charts always carry direct labels and a table view.
// ---------------------------------------------------------------------------
const SERIES = "#1559d6";
const CARRIER_COLOURS: Record<string, string> = { DHL: "#eda100", FDX: "#1559d6", UPS: "#ed2924" };
const GRID = "#e6ecf6";
const AXIS_TEXT = { fontSize: 11, fill: "#64748b" };

type Stats = {
  range: { from: string; to: string; grouping: "day" | "month" };
  totals: {
    quotes: number;
    spend: number;
    avg_cost: number;
    avg_per_kg: number;
    savings: number;
    cheapest_pick_rate: number;
    destinations: number;
  };
  over_time: { period: string; quotes: number; spend: number }[];
  by_country: { name: string; quotes: number; spend: number }[];
  by_carrier: { carrier: string; name: string; quotes: number; spend: number; avg_per_kg: number }[];
  by_service: { name: string; quotes: number }[];
  by_staff: { name: string; quotes: number; spend: number }[];
  price_ranges: { label: string; quotes: number }[];
  rate_card: { filename: string; effective_date: string; age_months: number; max_age_months: number; is_stale: boolean } | null;
};

const PRESETS: [string, number][] = [
  ["7 days", 7],
  ["30 days", 30],
  ["90 days", 90],
  ["12 months", 365],
];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  return isoDay(d);
}

const compact = (n: number) => (n >= 1000 ? `${num(n / 1000, 1)}K` : num(n, 0));

// ---------------------------------------------------------------------------
// Admin overview
// ---------------------------------------------------------------------------
export default function Dashboard({ onOpenRateCards }: { onOpenRateCards: () => void }) {
  const [range, setRange] = useState({ from: daysAgo(30), to: isoDay(), preset: 30 as number | null });
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api<Stats>(`/api/admin/stats${query({ date_from: range.from, date_to: range.to })}`)
      .then((s) => {
        setStats(s);
        setError("");
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  const t = stats?.totals;
  const periodLabel = (p: string) =>
    stats?.range.grouping === "month"
      ? new Date(`${p}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
      : new Date(`${p}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="space-y-6">
      {/* ---------- One filter row scopes everything below ---------- */}
      <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_6px_24px_rgba(7,27,85,0.06)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Date range">
          {PRESETS.map(([label, days]) => (
            <button
              key={days}
              type="button"
              aria-pressed={range.preset === days}
              onClick={() => setRange({ from: daysAgo(days), to: isoDay(), preset: days })}
              className={`rounded-lg px-3.5 py-2 text-sm font-bold transition ${
                range.preset === days ? "bg-brand-blue text-white" : "text-slate-600 hover:bg-brand-ice hover:text-brand-navy"
              }`}
            >
              Last {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <input
            type="date"
            aria-label="From date"
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value, preset: null })}
            className="h-10 rounded-lg border border-blue-100 bg-brand-ice/40 px-3 text-sm outline-none focus:border-brand-blue"
          />
          <span>to</span>
          <input
            type="date"
            aria-label="To date"
            value={range.to}
            min={range.from}
            onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value, preset: null })}
            className="h-10 rounded-lg border border-blue-100 bg-brand-ice/40 px-3 text-sm outline-none focus:border-brand-blue"
          />
        </div>
      </div>

      <Banner notice={error ? { type: "error", text: error } : null} />

      {stats?.rate_card?.is_stale && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2.5 text-sm">
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              <strong>The rate card may be out of date.</strong> {stats.rate_card.filename} has been in effect since{" "}
              {fmtDate(stats.rate_card.effective_date)} ({num(stats.rate_card.age_months, 0)} months, warning set at {stats.rate_card.max_age_months}).
            </span>
          </p>
          <button type="button" onClick={onOpenRateCards} className="shrink-0 text-sm font-bold underline-offset-4 hover:underline">
            Review rate cards →
          </button>
        </div>
      )}

      {/* While refetching, keep the previous numbers on screen, dimmed - no flash */}
      <div className={`space-y-6 transition-opacity ${loading && stats ? "opacity-60" : ""}`}>
        {/* ---------- KPI row ---------- */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Quotes submitted" value={t ? num(t.quotes, 0) : "–"} />
          <StatTile label="Total of selected rates" value={t ? rm(t.spend) : "–"} />
          <StatTile label="Average per quote" value={t ? rm(t.avg_cost) : "–"} />
          <StatTile label="Average per chargeable kg" value={t ? rm(t.avg_per_kg) : "–"} />
          <StatTile label="Saved vs. dearest option" value={t ? rm(t.savings) : "–"} note="Compared with the most expensive service in each quote" />
          <StatTile label="Lowest price chosen" value={t ? `${num(t.cheapest_pick_rate, 1)}%` : "–"} note="Share of quotes where staff picked the cheapest service" />
        </div>

        {stats && stats.totals.quotes === 0 ? (
          <section className={`${panel} p-6`}>
            <EmptyState title="No quotes in this period" text="Pick a longer range, or check back once staff submit comparisons." />
          </section>
        ) : stats ? (
          <>
            {/* ---------- Trend ---------- */}
            <ChartCard
              title="Quotes over time"
              subtitle={`Quotes submitted per ${stats.range.grouping}`}
              table={
                <SimpleTable
                  head={[stats.range.grouping === "month" ? "Month" : "Day", "Quotes", "Total (RM)"]}
                  rows={stats.over_time.filter((r) => r.quotes > 0).map((r) => [periodLabel(r.period), num(r.quotes, 0), rm(r.spend)])}
                />
              }
            >
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={stats.over_time} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis
                    dataKey="period"
                    tickFormatter={periodLabel}
                    tick={AXIS_TEXT}
                    axisLine={{ stroke: GRID }}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis allowDecimals={false} tick={AXIS_TEXT} axisLine={false} tickLine={false} width={36} tickFormatter={compact} />
                  <Tooltip
                    cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <Tip
                          title={periodLabel(String(payload[0].payload.period))}
                          rows={[
                            [SERIES, `${num(Number(payload[0].payload.quotes), 0)} quotes`],
                            ["", rm(Number(payload[0].payload.spend))],
                          ]}
                        />
                      ) : null
                    }
                  />
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="quotes"
                    stroke={SERIES}
                    strokeWidth={2}
                    fill={SERIES}
                    fillOpacity={0.1}
                    dot={false}
                    activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2, fill: SERIES }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* ---------- Top destinations ---------- */}
              <ChartCard
                title="Top destinations"
                subtitle="Countries shipped to most often"
                table={<SimpleTable head={["Destination", "Quotes", "Total (RM)"]} rows={stats.by_country.map((r) => [r.name, num(r.quotes, 0), rm(r.spend)])} />}
              >
                <HorizontalBars data={stats.by_country.map((r) => ({ name: r.name, value: r.quotes, extra: rm(r.spend) }))} unit="quotes" />
              </ChartCard>

              {/* ---------- Price ranges ---------- */}
              <ChartCard
                title="Price range"
                subtitle="How many quotes fall in each price band (selected service)"
                table={<SimpleTable head={["Price band", "Quotes"]} rows={stats.price_ranges.map((r) => [r.label, num(r.quotes, 0)])} />}
              >
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats.price_ranges} margin={{ top: 20, right: 8, bottom: 10, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis
                      dataKey="label"
                      tick={AXIS_TEXT}
                      tickFormatter={(v: string) => v.replace("RM ", "").replace(",000", "K").replace(",500", ".5K")}
                      axisLine={{ stroke: GRID }}
                      tickLine={false}
                      interval={0}
                      label={{ value: "Price band (RM)", position: "insideBottom", offset: -2, style: AXIS_TEXT }}
                      height={40}
                    />
                    <YAxis allowDecimals={false} tick={AXIS_TEXT} axisLine={false} tickLine={false} width={36} tickFormatter={compact} />
                    <Tooltip
                      cursor={{ fill: "rgba(21,89,214,0.06)" }}
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <Tip title={String(payload[0].payload.label)} rows={[[SERIES, `${num(Number(payload[0].value), 0)} quotes`]]} />
                        ) : null
                      }
                    />
                    <Bar dataKey="quotes" fill={SERIES} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      <LabelList dataKey="quotes" position="top" style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }} formatter={(v) => (Number(v) > 0 ? num(Number(v), 0) : "")} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* ---------- Carrier share ---------- */}
              <ChartCard
                title="Carrier share"
                subtitle="Which carrier staff chose"
                table={
                  <SimpleTable
                    head={["Carrier", "Quotes", "Share", "Total (RM)"]}
                    rows={stats.by_carrier.map((r) => [r.name, num(r.quotes, 0), `${num((r.quotes / stats.totals.quotes) * 100, 1)}%`, rm(r.spend)])}
                  />
                }
              >
                <CarrierShare rows={stats.by_carrier} total={stats.totals.quotes} />
              </ChartCard>

              {/* ---------- Cost per kg ---------- */}
              <ChartCard
                title="Average cost per kg by carrier"
                subtitle="Selected price ÷ chargeable weight - lower is better value"
                table={<SimpleTable head={["Carrier", "RM per kg", "Quotes"]} rows={stats.by_carrier.map((r) => [r.name, rm(r.avg_per_kg), num(r.quotes, 0)])} />}
              >
                <HorizontalBars
                  data={[...stats.by_carrier]
                    .sort((a, b) => a.avg_per_kg - b.avg_per_kg)
                    .map((r) => ({ name: r.name, value: r.avg_per_kg, colour: CARRIER_COLOURS[r.carrier] ?? SERIES, extra: `${num(r.quotes, 0)} quotes` }))}
                  format={(v) => rm(v)}
                  unit="per kg"
                />
              </ChartCard>
            </div>

            {/* ---------- Leaderboards ---------- */}
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Quotes by staff" subtitle="Who submitted the most comparisons">
                <SimpleTable head={["Staff", "Quotes", "Total (RM)"]} rows={stats.by_staff.map((r) => [r.name, num(r.quotes, 0), rm(r.spend)])} />
              </ChartCard>
              <ChartCard title="Services chosen" subtitle="How often each service was selected">
                <SimpleTable
                  head={["Service", "Quotes", "Share"]}
                  rows={stats.by_service.map((r) => [r.name, num(r.quotes, 0), `${num((r.quotes / stats.totals.quotes) * 100, 1)}%`])}
                />
              </ChartCard>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white px-4 py-4 shadow-[0_6px_20px_rgba(7,27,85,0.05)]" title={note}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1.5 text-xl font-extrabold tracking-[-0.02em] text-brand-navy">{value}</p>
      {note && <p className="mt-1 text-[11px] leading-4 text-slate-400">{note}</p>}
    </div>
  );
}

/** Card for one chart, with a toggle to the same numbers as a table. */
function ChartCard({ title, subtitle, table, children }: { title: string; subtitle?: string; table?: ReactNode; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={panel}>
      <TopBar />
      <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div>
          <h3 className="font-extrabold text-brand-navy">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {table && (
          <div className="flex shrink-0 rounded-lg bg-brand-ice p-0.5 text-xs font-bold" role="group" aria-label={`${title} view`}>
            {(["Chart", "Table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={(v === "Table") === asTable}
                onClick={() => setAsTable(v === "Table")}
                className={`rounded-md px-2.5 py-1 ${(v === "Table") === asTable ? "bg-white text-brand-navy shadow-sm" : "text-slate-500"}`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="px-3 pb-4 sm:px-5">{asTable && table ? table : children}</div>
    </section>
  );
}

/** Tooltip: value first and strong, label after; series keyed with a short line. */
function Tip({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-500">{title}</p>
      {rows.map(([colour, text], i) => (
        <p key={i} className="flex items-center gap-2">
          {colour ? <span className="h-0.5 w-3 rounded" style={{ backgroundColor: colour }} /> : <span className="w-3" />}
          <span className={i === 0 ? "font-bold text-slate-900" : "text-slate-600"}>{text}</span>
        </p>
      ))}
    </div>
  );
}

function HorizontalBars({
  data,
  unit,
  format = (v) => num(v, 0),
}: {
  data: { name: string; value: number; colour?: string; extra?: string }[];
  unit: string;
  format?: (v: number) => string;
}) {
  const height = Math.max(120, data.length * 34 + 16);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 96, bottom: 4, left: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fontSize: 12, fill: "#334155" }}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(21,89,214,0.06)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <Tip
                title={String(payload[0].payload.name)}
                rows={[
                  [payload[0].payload.colour ?? SERIES, `${format(Number(payload[0].value))} ${unit}`],
                  ...(payload[0].payload.extra ? ([["", String(payload[0].payload.extra)]] as [string, string][]) : []),
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="value" maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.colour ?? SERIES} />
          ))}
          <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }} formatter={(v) => format(Number(v))} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Part-to-whole as one stacked bar with 2px gaps, a legend and direct labels. */
function CarrierShare({ rows, total }: { rows: Stats["by_carrier"]; total: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const hovered = rows.find((r) => r.carrier === hover);
  return (
    <div className="px-2 pt-4">
      <div className="relative">
        <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-[4px]">
          {rows.map((r) => (
            <button
              key={r.carrier}
              type="button"
              aria-label={`${r.name}: ${r.quotes} quotes`}
              onMouseEnter={() => setHover(r.carrier)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(r.carrier)}
              onBlur={() => setHover(null)}
              className="h-full transition-opacity"
              style={{
                width: `${(r.quotes / total) * 100}%`,
                backgroundColor: CARRIER_COLOURS[r.carrier] ?? "#94a3b8",
                opacity: hover && hover !== r.carrier ? 0.55 : 1,
              }}
            />
          ))}
        </div>
        {hovered && (
          <div className="absolute left-1/2 top-11 z-10 -translate-x-1/2">
            <Tip
              title={hovered.name}
              rows={[
                [CARRIER_COLOURS[hovered.carrier] ?? SERIES, `${num((hovered.quotes / total) * 100, 1)}% · ${num(hovered.quotes, 0)} quotes`],
                ["", rm(hovered.spend)],
              ]}
            />
          </div>
        )}
      </div>

      {/* Legend with direct values, so identity never relies on colour alone */}
      <ul className="mt-6 space-y-3">
        {rows.map((r) => (
          <li key={r.carrier} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: CARRIER_COLOURS[r.carrier] ?? "#94a3b8" }} />
              <span className="font-semibold text-slate-800">{r.name}</span>
            </span>
            <span className="text-slate-500">
              <strong className="text-slate-900">{num((r.quotes / total) * 100, 1)}%</strong> · {num(r.quotes, 0)} quotes · {rm(r.spend)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) return <p className="px-2 py-6 text-center text-sm text-slate-400">No data in this period.</p>;
  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-blue-50">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-brand-ice text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-2.5 font-semibold ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-blue-50">
              {r.map((cell, j) => (
                <td key={j} className={`px-4 py-2 ${j > 0 ? "text-right tabular-nums text-slate-600" : "font-medium text-slate-800"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
