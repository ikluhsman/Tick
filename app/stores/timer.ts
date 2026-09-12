// Timer store — server is the source of truth (running timer = time_entries row with end IS NULL).
// Hydrates from GET /api/timer on app mount; ticks elapsedSec every second while running.
// Also holds a local "draft" (name/ref/billable) for the idle state, before a timer exists server-side.

interface TimerPatch {
  name?: string
  refType?: RefType
  refId?: string | null
  billable?: boolean
}

export const useTimerStore = defineStore('timer', () => {
  const session = useUserSession()

  const timer = ref<TimerState | null>(null)
  const elapsedSec = ref(0)

  // Idle draft — what the timer bar shows before start; consumed by start()
  const draftName = ref('')
  const draftRef = ref<ChainRef | null>(null)
  const draftBillable = ref(true)

  const running = computed(() => !!timer.value)

  /** Chain currently shown in the timer bar (running ref, else idle draft). */
  const currentRef = computed<ChainRef | null>(() => timer.value ? timer.value.ref : draftRef.value)

  const billable = computed(() => timer.value ? timer.value.billable : draftBillable.value)

  const currentName = computed(() => timer.value ? timer.value.name : draftName.value)

  /** $/h shown in the timer bar. Running: server-resolved. Idle: display-only guess from catalog DTOs (server re-resolves on start). */
  const resolvedRate = computed<number | null>(() => {
    if (timer.value) return timer.value.resolvedRate
    const userRate = (session.user.value as SessionUser | null)?.defaultRate ?? null
    const r = draftRef.value
    if (!r) return userRate
    const catalog = useCatalogStore()
    if (r.refType === 'client') {
      const c = catalog.clients.find(x => x.id === r.refId)
      return c?.rate ?? userRate
    }
    const projectId = r.refType === 'project' ? r.refId : r.projectId
    if (projectId) {
      const p = catalog.projects.find(x => x.id === projectId)
      if (p) return p.resolvedRate ?? userRate
    }
    return userRate
  })

  let tickHandle: ReturnType<typeof setInterval> | null = null

  function syncElapsed() {
    elapsedSec.value = timer.value
      ? Math.max(0, Math.floor((Date.now() - new Date(timer.value.start).getTime()) / 1000))
      : 0
  }

  function startTicking() {
    stopTicking()
    syncElapsed()
    if (import.meta.client) tickHandle = setInterval(syncElapsed, 1000)
  }

  function stopTicking() {
    if (tickHandle) {
      clearInterval(tickHandle)
      tickHandle = null
    }
  }

  /** GET /api/timer — call once on app mount (default layout). Survives reloads. */
  async function hydrate() {
    try {
      timer.value = await $fetch<TimerState | null>('/api/timer') ?? null
    } catch {
      timer.value = null
    }
    if (timer.value) startTicking()
    else {
      stopTicking()
      elapsedSec.value = 0
    }
  }

  /** POST /api/timer/start — falls back to the idle draft for omitted fields. */
  async function start(payload?: { name?: string, refType?: RefType, refId?: string, billable?: boolean }) {
    const body: Record<string, unknown> = {
      name: payload?.name ?? draftName.value,
      billable: payload?.billable ?? draftBillable.value
    }
    const refType = payload?.refType ?? draftRef.value?.refType
    const refId = payload?.refId ?? draftRef.value?.refId
    if (refType && refId) {
      body.refType = refType
      body.refId = refId
    }
    timer.value = await $fetch<TimerState>('/api/timer/start', { method: 'POST', body })
    startTicking()
    return timer.value
  }

  /** POST /api/timer/stop → EntryDto | null (null = <1s elapsed, discarded server-side). */
  async function stop(): Promise<EntryDto | null> {
    if (!timer.value) return null
    const dto = await $fetch<EntryDto | null>('/api/timer/stop', { method: 'POST' })
    timer.value = null
    stopTicking()
    elapsedSec.value = 0
    draftName.value = ''
    draftRef.value = null
    draftBillable.value = true
    return dto ?? null
  }

  /** PATCH /api/timer while running; merges into the idle draft otherwise. */
  async function update(patch: TimerPatch) {
    if (timer.value) {
      timer.value = await $fetch<TimerState>('/api/timer', { method: 'PATCH', body: patch })
      return timer.value
    }
    if (patch.name !== undefined) draftName.value = patch.name
    if (patch.billable !== undefined) draftBillable.value = patch.billable
    if (patch.refId === null) draftRef.value = null
    else if (patch.refType && patch.refId) draftRef.value = buildDraftChain(patch.refType, patch.refId)
    return null
  }

  function setName(name: string) {
    if (timer.value) {
      if (name !== timer.value.name) update({ name }).catch(() => {})
    } else {
      draftName.value = name
    }
  }

  async function attach(refType: RefType, refId: string) {
    if (timer.value) return update({ refType, refId })
    draftRef.value = buildDraftChain(refType, refId)
    return null
  }

  async function detach() {
    if (timer.value) return update({ refId: null })
    draftRef.value = null
    return null
  }

  async function toggleBillable() {
    if (timer.value) return update({ billable: !timer.value.billable })
    draftBillable.value = !draftBillable.value
    return null
  }

  /** Display-only chain for the idle draft, resolved from catalog DTOs (Rule 1 lives server-side). */
  function buildDraftChain(refType: RefType, refId: string): ChainRef {
    const catalog = useCatalogStore()
    const chain: ChainRef = { refType, refId }
    if (refType === 'task') {
      const t = catalog.tasks.find(x => x.id === refId)
      if (t) {
        chain.taskId = t.id
        chain.taskName = t.name
        if (t.projectId) {
          chain.projectId = t.projectId
          chain.projectName = t.projectName ?? undefined
          chain.clientName = t.clientName ?? undefined
        }
      }
    } else if (refType === 'project') {
      const p = catalog.projects.find(x => x.id === refId)
      if (p) {
        chain.projectId = p.id
        chain.projectName = p.name
        chain.clientId = p.clientId ?? undefined
        chain.clientName = p.clientName ?? undefined
        chain.clientColor = p.clientColor ?? undefined
      }
    } else {
      const c = catalog.clients.find(x => x.id === refId)
      if (c) {
        chain.clientId = c.id
        chain.clientName = c.name
        chain.clientColor = c.color
      }
    }
    return chain
  }

  return {
    timer,
    elapsedSec,
    draftName,
    draftRef,
    draftBillable,
    running,
    currentRef,
    currentName,
    billable,
    resolvedRate,
    hydrate,
    start,
    stop,
    update,
    setName,
    attach,
    detach,
    toggleBillable
  }
})
