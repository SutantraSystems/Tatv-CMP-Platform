/** Charts and the log viewer shared by the tenant portal and the operator console. */
import { Button, FormSelect, FormSelectOption, Label, SearchInput, Switch, ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RANGES,
  SEVERITIES,
  avgOf,
  histogram,
  lastOf,
  logs as genLogs,
  maxOf,
  type LogLine,
  type RangeId,
  type Series,
  type Severity,
  type Template,
} from './data';
import './obs.css';

export const SERIES_COLOURS = ['#1f4fc4', '#0f8f7e', '#c46a12', '#8a44c2'];
export const SEV_COLOUR: Record<Severity, string> = {
  critical: '#8f0d0d',
  error: '#c9190b',
  warning: '#d48a00',
  info: '#4a74d8',
  debug: '#9aa2b4',
};
export const SEV_LABEL: Record<Severity, string> = { critical: 'Critical', error: 'Error', warning: 'Warning', info: 'Info', debug: 'Debug' };

const fmtClock = (t: number, range: RangeId) =>
  new Date(t).toLocaleString('en-IN', range === '7d' ? { day: '2-digit', month: 'short' } : { hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtStamp = (t: number) =>
  new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

const fmtNum = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number.isInteger(v) ? String(v) : v.toFixed(1));

export function RangePicker({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  return (
    <ToggleGroup aria-label="Time range" isCompact>
      {RANGES.map((r) => (
        <ToggleGroupItem key={r.id} text={r.id} aria-label={r.label} buttonId={`range-${r.id}`} isSelected={value === r.id} onChange={() => onChange(r.id)} />
      ))}
    </ToggleGroup>
  );
}

/** Multi-series line chart with hover read-out, an optional threshold line and a data table toggle. */
export function LineChart({
  title,
  series,
  unit = '',
  range,
  threshold,
  max,
  height = 170,
}: {
  title: string;
  series: Series[];
  unit?: string;
  range: RangeId;
  threshold?: { value: number; label: string };
  max?: number;
  height?: number;
}) {
  const [hover, setHover] = useState<number>();
  const [asTable, setAsTable] = useState(false);
  const plot = useRef<HTMLDivElement>(null);
  const n = series[0]?.points.length ?? 0;
  const top = useMemo(() => {
    const m = Math.max(threshold?.value ?? 0, ...series.flatMap((s) => s.points.map((p) => p.v)));
    if (max !== undefined) return max;
    const mag = 10 ** Math.floor(Math.log10(Math.max(m, 1)));
    return Math.ceil((m * 1.1) / mag) * mag || 1;
  }, [series, threshold, max]);
  const W = 600;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => height - (v / top) * height;
  const path = (s: Series) => s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const times = series[0]?.points.map((p) => p.t) ?? [];

  function move(e: React.MouseEvent) {
    const box = plot.current?.getBoundingClientRect();
    if (!box || n < 2) return;
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHover(Math.round(f * (n - 1)));
  }

  return (
    <figure className="obs-chart" aria-label={title}>
      <figcaption className="obs-chart__head">
        <span className="obs-chart__title">{title}</span>
        <button type="button" className="obs-link" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Chart' : 'Table'}
        </button>
      </figcaption>
      {asTable ? (
        <div className="obs-table-wrap">
          <table className="obs-table">
            <thead>
              <tr>
                <th>Time</th>
                {series.map((s) => (
                  <th key={s.name}>
                    {s.name}
                    {unit && ` (${unit.trim()})`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times
                .map((t, i) => (
                  <tr key={t}>
                    <td>{fmtStamp(t)}</td>
                    {series.map((s) => (
                      <td key={s.name}>{s.points[i]?.v}</td>
                    ))}
                  </tr>
                ))
                .reverse()}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="obs-plot-row">
          <div className="obs-yaxis" style={{ height }}>
            <span>
              {fmtNum(top)}
              {unit}
            </span>
            <span>
              {fmtNum(top / 2)}
              {unit}
            </span>
            <span>0</span>
          </div>
          <div className="obs-plot" ref={plot} style={{ height }} onMouseMove={move} onMouseLeave={() => setHover(undefined)}>
            <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="obs-svg" aria-hidden="true">
              {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1={0} x2={W} y1={height * g} y2={height * g} className="obs-grid" />
              ))}
              {series.length === 1 && series[0] && (
                <path d={`${path(series[0])}L${W},${height}L0,${height}Z`} fill={SERIES_COLOURS[0]} opacity={0.08} />
              )}
              {threshold && <line x1={0} x2={W} y1={y(threshold.value)} y2={y(threshold.value)} className="obs-threshold" />}
              {series.map((s, i) => (
                <path key={s.name} d={path(s)} fill="none" stroke={SERIES_COLOURS[i % 4]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {threshold && (
              <span className="obs-threshold-label" style={{ top: `${(y(threshold.value) / height) * 100}%` }}>
                {threshold.label}
              </span>
            )}
            {hover !== undefined && (
              <>
                <span className="obs-cursor" style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%` }} />
                <div className={`obs-tip ${hover > n / 2 ? 'obs-tip--left' : ''}`} style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%` }}>
                  <strong>{fmtStamp(times[hover] ?? 0)}</strong>
                  {series.map((s, i) => (
                    <span key={s.name}>
                      <i style={{ background: SERIES_COLOURS[i % 4] }} />
                      {s.name}: {s.points[hover]?.v}
                      {unit}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {!asTable && (
        <div className="obs-xaxis">
          <span>{times[0] !== undefined && fmtClock(times[0], range)}</span>
          <span>{times[Math.floor(n / 2)] !== undefined && fmtClock(times[Math.floor(n / 2)]!, range)}</span>
          <span>now</span>
        </div>
      )}
      <div className="obs-legend">
        {series.map((s, i) => (
          <span key={s.name}>
            <i style={{ background: SERIES_COLOURS[i % 4] }} />
            {s.name}
            <em>
              now {lastOf(s.points)}
              {unit} · avg {avgOf(s.points)}
              {unit} · max {maxOf(s.points)}
              {unit}
            </em>
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Tiny trend line for tables. */
export function Sparkline({ values, colour = SERIES_COLOURS[0]!, w = 96, h = 24 }: { values: number[]; colour?: string; w?: number; h?: number }) {
  const top = Math.max(...values, 1);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - (v / top) * (h - 2) - 1).toFixed(1)}`).join('');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="obs-spark" aria-hidden="true">
      <path d={d} fill="none" stroke={colour} strokeWidth={1.4} />
    </svg>
  );
}

export function SeverityLabel({ severity }: { severity: Severity }) {
  return (
    <span className={`obs-sev obs-sev--${severity}`}>
      <i style={{ background: SEV_COLOUR[severity] }} />
      {SEV_LABEL[severity]}
    </span>
  );
}

function LogHistogram({ lines, range }: { lines: LogLine[]; range: RangeId }) {
  const buckets = histogram(lines, range, 40);
  const top = Math.max(1, ...buckets.map((b) => SEVERITIES.reduce((s, k) => s + b.counts[k], 0)));
  return (
    <div className="obs-hist" aria-label="Log volume over time">
      {buckets.map((b) => {
        const total = SEVERITIES.reduce((s, k) => s + b.counts[k], 0);
        return (
          <div key={b.t} className="obs-hist__col" title={`${fmtStamp(b.t)}: ${total} lines`}>
            {SEVERITIES.map((k) =>
              b.counts[k] ? <span key={k} style={{ height: `${(b.counts[k] / top) * 100}%`, background: SEV_COLOUR[k] }} /> : null,
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Searchable log viewer with severity and source filters, a volume histogram, expandable lines and live tail.
 * Live tail appends synthetic lines from the same templates every two seconds.
 */
export function LogViewer({
  lines,
  range,
  sources,
  tail,
  showSubject = true,
  emptyText = 'No log lines match these filters.',
}: {
  lines: LogLine[];
  range: RangeId;
  sources?: string[];
  tail?: { seed: string; templates: Template[]; subjects: string[] };
  showSubject?: boolean;
  emptyText?: string;
}) {
  const [query, setQuery] = useState('');
  const [sevs, setSevs] = useState<Severity[]>(['critical', 'error', 'warning', 'info']);
  const [source, setSource] = useState('all');
  const [open, setOpen] = useState<string>();
  const [limit, setLimit] = useState(100);
  const [live, setLive] = useState(false);
  const [extra, setExtra] = useState<LogLine[]>([]);

  useEffect(() => {
    if (!live || !tail) return;
    let tick = 0;
    const id = window.setInterval(() => {
      tick++;
      const fresh = genLogs(`${tail.seed}-tail-${Date.now()}-${tick}`, tail.templates, tail.subjects, '1h', 20)
        .slice(0, 1 + (tick % 2))
        .map((l, i) => ({ ...l, id: `tail-${Date.now()}-${i}`, t: Date.now() - i * 200 }));
      setExtra((e) => [...fresh, ...e].slice(0, 200));
    }, 2000);
    return () => window.clearInterval(id);
  }, [live, tail]);

  const all = useMemo(() => [...extra, ...lines], [extra, lines]);
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (l) =>
      sevs.includes(l.severity) &&
      (source === 'all' || l.source === source) &&
      (!q || l.message.toLowerCase().includes(q) || l.subject.toLowerCase().includes(q)),
  );
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, all.filter((l) => l.severity === s && (source === 'all' || l.source === source)).length])) as Record<Severity, number>;
  const toggle = (s: Severity) => setSevs((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div className="obs-logs">
      <div className="obs-logs__bar">
        <SearchInput
          aria-label="Search logs"
          placeholder="Search messages, e.g. timeout or 502"
          value={query}
          onChange={(_e, v) => setQuery(v)}
          onClear={() => setQuery('')}
          className="obs-logs__search"
        />
        {sources && sources.length > 1 && (
          <FormSelect aria-label="Log source" value={source} onChange={(_e, v) => setSource(v)} className="obs-logs__source">
            <FormSelectOption value="all" label="All sources" />
            {sources.map((s) => (
              <FormSelectOption key={s} value={s} label={s} />
            ))}
          </FormSelect>
        )}
        {tail && <Switch id={`tail-${tail.seed}`} label="Live tail" isChecked={live} onChange={(_e, c) => setLive(c)} />}
      </div>
      <div className="obs-logs__sevs" role="group" aria-label="Severity">
        {SEVERITIES.map((s) => (
          <button key={s} type="button" className={`obs-chip ${sevs.includes(s) ? 'is-on' : ''}`} aria-pressed={sevs.includes(s)} onClick={() => toggle(s)}>
            <i style={{ background: SEV_COLOUR[s] }} />
            {SEV_LABEL[s]} <b>{counts[s]}</b>
          </button>
        ))}
        <span className="obs-logs__count">
          {shown.length.toLocaleString('en-IN')} of {all.length.toLocaleString('en-IN')} lines
          {live && <Label color="green" isCompact className="obs-live">Live</Label>}
        </span>
      </div>
      <LogHistogram lines={shown} range={range} />
      <div className={`obs-loglist ${showSubject ? '' : 'obs-loglist--nosubj'}`} role="list" aria-label="Log lines">
        {shown.length === 0 && <p className="obs-empty">{emptyText}</p>}
        {shown.slice(0, limit).map((l) => (
          <div key={l.id} role="listitem" className={`obs-line obs-line--${l.severity} ${open === l.id ? 'is-open' : ''}`}>
            <button type="button" className="obs-line__row" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? undefined : l.id)}>
              <time>{fmtStamp(l.t)}</time>
              <SeverityLabel severity={l.severity} />
              <span className="obs-line__src">{l.source}</span>
              {showSubject && <span className="obs-line__subj">{l.subject}</span>}
              <span className="obs-line__msg">{l.message}</span>
            </button>
            {open === l.id && <pre className="obs-line__json">{JSON.stringify({ timestamp: new Date(l.t).toISOString(), message: l.message, ...l.fields }, null, 2)}</pre>}
          </div>
        ))}
      </div>
      {shown.length > limit && (
        <Button variant="link" onClick={() => setLimit((n) => n + 200)}>
          Show more ({(shown.length - limit).toLocaleString('en-IN')} remaining)
        </Button>
      )}
    </div>
  );
}
