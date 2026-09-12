// Import feature DTOs (Settings → Import). Separate file — shared/types/index.ts is frozen.

export type ImportSource = 'toggl' | 'clockify' | 'generic'

export interface ImportCatalogItem {
  name: string
  /** true = matched an existing catalog row by lowercase name; false = will be created */
  existing: boolean
}

export interface ImportRowPreview {
  name: string
  client: string | null
  project: string | null
  task: string | null
  tags: string[]
  billable: boolean
  start: string // ISO
  end: string // ISO
  durationSec: number
}

export interface ImportWarning {
  /** 1-based line number in the CSV file (header = line 1) */
  line: number
  reason: string
}

export interface ImportPreview {
  source: ImportSource
  entryCount: number
  dateRange: { from: string, to: string } | null
  clients: ImportCatalogItem[]
  projects: ImportCatalogItem[]
  tasks: ImportCatalogItem[]
  tags: ImportCatalogItem[]
  /** First 10 importable rows */
  rows: ImportRowPreview[]
  /** Skipped rows + why (never aborts the whole import) */
  warnings: ImportWarning[]
}

export interface ImportCommitResult {
  entries: number
  created: { clients: number, projects: number, tasks: number, tags: number }
  matched: { clients: number, projects: number, tasks: number, tags: number }
  skipped: number
  dateRange: { from: string, to: string } | null
}
