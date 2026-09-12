// Dashboard data + card-visibility preferences + small display helpers.
// Data comes from GET /api/summary/dashboard (DashboardSummary, shared types);
// the client never derives chains or rates itself (Rules 1–2 live server-side).

export function useDashboard() {
  const { data: summary, pending, error, refresh } = useFetch<DashboardSummary | null>(
    '/api/summary/dashboard',
    { key: 'dashboard-summary', default: () => null }
  )
  return { summary, pending, error, refresh }
}

// ── Card show/hide preferences (persisted to localStorage) ─────────────────
// Cards are toggleable but not freely arrangeable (README §Dashboard).

export interface DashboardCards {
  stats: boolean
  activity: boolean
  billable: boolean
  week: boolean
}

const CARDS_KEY = 'tick-dashboard-cards'

const defaultCards = (): DashboardCards => ({
  stats: true,
  activity: true,
  billable: true,
  week: true
})

export function useDashboardCards() {
  const cards = useState<DashboardCards>('dashboard-cards', defaultCards)

  /** Read saved prefs on the client after hydration (avoids SSR mismatch). */
  function hydrateCards() {
    if (!import.meta.client) return
    try {
      const raw = localStorage.getItem(CARDS_KEY)
      if (raw) cards.value = { ...defaultCards(), ...JSON.parse(raw) }
    } catch {
      // corrupt prefs — fall back to defaults
    }
  }

  function setCard(key: keyof DashboardCards, on: boolean) {
    cards.value = { ...cards.value, [key]: on }
    try {
      localStorage.setItem(CARDS_KEY, JSON.stringify(cards.value))
    } catch {
      // storage unavailable — prefs just won't persist
    }
  }

  return { cards, hydrateCards, setCard }
}

// ── Display helpers (dash-prefixed to avoid clashing with app/utils/parse.ts) ──

/** Seconds → "4h 30m" / "39h 20m" / "45m" / "0m". */
export function dashDuration(sec: number): string {
  const totalMin = Math.round(Math.max(0, sec) / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

/** Dollars → "$3,699" (whole dollars, US grouping). */
export function dashMoney(n: number): string {
  return '$' + Math.round(Math.max(0, n)).toLocaleString('en-US')
}

/** "2026-09-11" (or full ISO) → local Date at midnight. */
export function dashParseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

/** True when the ISO day string is today (local time). */
export function dashIsToday(iso: string): boolean {
  const now = new Date()
  const d = dashParseDay(iso)
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

/** Skip GSAP draw-ins when the user prefers reduced motion. */
export function dashReducedMotion(): boolean {
  return import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
