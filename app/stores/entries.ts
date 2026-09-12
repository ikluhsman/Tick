// Entries store — list for the Time page plus selection / filter / undo state.
// The `filtered` getter implements the free-text filter: `#tag`, `@name` (chain), plain text (name).

export interface ManualEntryPayload {
  name: string
  refType?: RefType
  refId?: string
  billable?: boolean
  rateOverride?: number | null
  start: string
  end: string
  tags?: string[]
}

export const useEntriesStore = defineStore('entries', () => {
  const entries = ref<EntryDto[]>([])
  const selection = ref<Set<string>>(new Set())
  const filter = ref('')
  const groupBy = ref<'day' | 'project'>('day')
  const undoStack = ref<DeleteResult[]>([])
  const lastRange = ref<{ from: string, to: string } | null>(null)

  /** Entries passing the free-text filter. Tokens: `#tag` matches tags, `@name` matches chain names, else name/tags/chain. */
  const filtered = computed<EntryDto[]>(() => {
    const q = filter.value.trim().toLowerCase()
    if (!q) return entries.value
    const tokens = q.split(/\s+/)
    return entries.value.filter((e) => {
      const name = e.name.toLowerCase()
      const tags = e.tags.map(t => t.toLowerCase())
      const chain = [e.ref?.taskName, e.ref?.projectName, e.ref?.clientName]
        .filter((s): s is string => !!s)
        .map(s => s.toLowerCase())
      return tokens.every((t) => {
        if (t.startsWith('#')) {
          const tag = t.slice(1)
          return !tag || tags.some(x => x.includes(tag))
        }
        if (t.startsWith('@')) {
          const n = t.slice(1)
          return !n || chain.some(x => x.includes(n))
        }
        return name.includes(t) || tags.some(x => x.includes(t)) || chain.some(x => x.includes(t))
      })
    })
  })

  const selectedIds = computed(() => [...selection.value])
  const hasSelection = computed(() => selection.value.size > 0)

  function sortDesc() {
    entries.value.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
  }

  /** GET /api/entries?from&to (ISO). Excludes running + trashed server-side. */
  async function fetchRange(from: string, to: string) {
    lastRange.value = { from, to }
    entries.value = await $fetch<EntryDto[]>('/api/entries', { query: { from, to } })
    return entries.value
  }

  async function refresh() {
    if (lastRange.value) await fetchRange(lastRange.value.from, lastRange.value.to)
  }

  /** POST /api/entries — saved entry sorts into its day group. */
  async function addManual(payload: ManualEntryPayload) {
    const dto = await $fetch<EntryDto>('/api/entries', { method: 'POST', body: payload })
    entries.value.push(dto)
    sortDesc()
    return dto
  }

  /** PATCH /api/entries/:id (partial fields, e.g. { billable }). */
  async function updateEntry(id: string, patch: Partial<ManualEntryPayload>) {
    const dto = await $fetch<EntryDto>(`/api/entries/${id}`, { method: 'PATCH', body: patch })
    const i = entries.value.findIndex(e => e.id === id)
    if (i >= 0) entries.value.splice(i, 1, dto)
    return dto
  }

  /** DELETE /api/entries/:id — soft delete (Rule 4); result pushed on undoStack. */
  async function remove(id: string) {
    const result = await $fetch<DeleteResult>(`/api/entries/${id}`, { method: 'DELETE' })
    entries.value = entries.value.filter(e => e.id !== id)
    selection.value.delete(id)
    selection.value = new Set(selection.value)
    undoStack.value.push(result)
    return result
  }

  /** POST /api/entries/bulk {action:'delete'} on the current selection. */
  async function bulkDelete() {
    const ids = [...selection.value]
    if (!ids.length) return null
    const result = await $fetch<DeleteResult>('/api/entries/bulk', {
      method: 'POST',
      body: { ids, action: 'delete' }
    })
    entries.value = entries.value.filter(e => !selection.value.has(e.id))
    selection.value = new Set()
    undoStack.value.push(result)
    return result
  }

  /** POST /api/entries/bulk {action:'billable'} on the current selection, then refetch (amounts resolve server-side). */
  async function bulkBillable(billable: boolean) {
    const ids = [...selection.value]
    if (!ids.length) return 0
    const count = await $fetch<number>('/api/entries/bulk', {
      method: 'POST',
      body: { ids, action: 'billable', billable }
    })
    selection.value = new Set()
    await refresh()
    return count
  }

  /** POST /api/restore with a DeleteResult snapshot (undo toast). */
  async function restore(deleted: DeleteResult) {
    await $fetch('/api/restore', { method: 'POST', body: { deleted: deleted.deleted } })
    const i = undoStack.value.indexOf(deleted)
    if (i >= 0) undoStack.value.splice(i, 1)
    await refresh()
  }

  /** Insert the EntryDto returned by POST /api/timer/stop at the top of Today. */
  function applyStoppedEntry(dto: EntryDto) {
    entries.value = entries.value.filter(e => e.id !== dto.id)
    entries.value.unshift(dto)
    sortDesc()
  }

  function toggleSelect(id: string) {
    const next = new Set(selection.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selection.value = next
  }

  function clearSelection() {
    selection.value = new Set()
  }

  return {
    entries,
    selection,
    filter,
    groupBy,
    undoStack,
    lastRange,
    filtered,
    selectedIds,
    hasSelection,
    fetchRange,
    refresh,
    addManual,
    updateEntry,
    remove,
    bulkDelete,
    bulkBillable,
    restore,
    applyStoppedEntry,
    toggleSelect,
    clearSelection
  }
})
