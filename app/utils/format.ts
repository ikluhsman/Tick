// Display formatters — pure functions, unit-testable.
// Locale is pinned to en-US so SSR and client render identically.

const DAY_MS = 86_400_000

/**
 * Map a server client-color token ("primary-400", "neutral-400") to a paintable
 * CSS value via Nuxt UI's ramp vars. Passes through values that are already CSS.
 */
export function clientColorVar(token: string | null | undefined, fallback = 'var(--ui-border-accented)'): string {
  if (!token) return fallback
  if (/^(#|var\(|rgb|hsl|oklch|color-mix)/.test(token)) return token
  return `var(--ui-color-${token})`
}

/**
 * Ink for text painted on top of a `clientColorVar` swatch (e.g. the avatar
 * initials on /clients) — WCAG AA (4.5:1) against every CLIENT_COLOR_PALETTE
 * entry (server/utils/entry-dto.ts), in both shipped color-mode defaults
 * (Nocturne/dark, Daylight/light).
 *
 * Unlike the app's semantic text tokens, these are raw Tailwind shades: a
 * `-400` swatch stays light and a `-600` one stays comparatively dark
 * regardless of app color-mode, so most of this is mode-INdependent — except
 * `primary-600`, because the *hue* behind "primary" changes per preset and
 * that shade happens to sit on opposite sides of the light/dark line for
 * violet (Nocturne's primary) vs. sky (Daylight's primary). Measured with
 * `test/unit/format.spec.ts`; re-measure if CLIENT_COLOR_PALETTE changes.
 */
export function clientColorInk(token: string | null | undefined, dark: boolean): string {
  const DARK_INK = 'var(--ui-color-neutral-950)'
  const LIGHT_INK = 'var(--ui-color-neutral-50)'
  if (token === 'secondary-600') return LIGHT_INK
  if (token === 'primary-600') return dark ? LIGHT_INK : DARK_INK
  return DARK_INK // primary-400, neutral-400, and any unrecognized token
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Seconds → "2h 15m" / "30m". Minutes are zero-padded when hours are present ("1h 05m"). */
export function formatDuration(sec: number): string {
  const totalMin = Math.round(Math.max(0, sec) / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/** Seconds → "01:23:45" (timer-bar clock). */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map(v => String(v).padStart(2, '0'))
    .join(':')
}

/** Date-ish → "9:05am". */
export function formatTime(d: Date | string | number): string {
  const date = new Date(d)
  let h = date.getHours()
  const m = date.getMinutes()
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')}${ap}`
}

/** "9:05am – 11:20am". */
export function formatRange(start: Date | string | number, end: Date | string | number): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

/** "$3,699" — rounded to whole dollars. */
export function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

/**
 * Day-group label: Today · Yesterday · weekday name (<7 days ago) ·
 * "Wed, Sep 2" (plus year when it differs from the reference year).
 */
export function formatDayLabel(d: Date | string | number, ref: Date = new Date()): string {
  const date = new Date(d)
  const diff = Math.round((startOfDay(ref).getTime() - startOfDay(date).getTime()) / DAY_MS)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff > 1 && diff < 7) return date.toLocaleDateString('en-US', { weekday: 'long' })
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== ref.getFullYear() ? 'numeric' : undefined
  })
}

/** "Sep 11" — the muted date beside a day-group label. */
export function formatDaySub(d: Date | string | number): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Fri, Sep 11, 2026" — manual-entry interpretation line. */
export function formatDateLong(d: Date | string | number): string {
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/** Estimate minutes → "40h" / "2h 30m". */
export function formatEstimate(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}h` : formatDuration(minutes * 60)
}
