// Catalog store — clients / projects / tasks / tags. Every mutation calls the API then refreshes
// (counts and resolved rates are server-derived, so a full refetch keeps DTOs truthful).

export interface ClientPayload {
  name: string
  rate?: number | null
}

export interface ProjectPayload {
  name: string
  clientId?: string | null
  rate?: number | null
  billableDefault?: boolean
  estimateMinutes?: number | null
  visibility?: 'private' | 'public'
  archived?: boolean
}

/**
 * DeleteResult extension returned by the cascade delete endpoints (see
 * server/utils/cascade.ts): the references each detach op cleared, so undo
 * can POST them back via /api/restore. Frozen shared DTO is untouched.
 */
export interface CascadeDeleteResult extends DeleteResult {
  relinked: {
    projects: { id: string, clientId: string }[]
    tasks: { id: string, projectId: string }[]
    entries: { id: string, refType: 'client' | 'project' | 'task', refId: string }[]
  }
}

export interface TaskPayload {
  name: string
  projectId?: string | null
  estimateMinutes?: number | null
  done?: boolean
}

export const useCatalogStore = defineStore('catalog', () => {
  // SSR-safe fetch: forwards the request's cookies when a catalog page fetches
  // during server render. On the client this is just $fetch.
  const requestFetch = useRequestFetch()

  const clients = ref<ClientDto[]>([])
  const projects = ref<ProjectDto[]>([])
  const tasks = ref<TaskDto[]>([])
  const tags = ref<TagDto[]>([])
  const loaded = ref(false)
  /** True when the state in this store came from a server render (serialized
   *  into the Pinia payload) and no client fetch has run yet. The layout's
   *  on-mount fetchAll() consumes it so hydration doesn't refetch what SSR
   *  just delivered; every later call refreshes normally. */
  const ssrFetched = ref(false)

  const openTasks = computed(() => tasks.value.filter(t => !t.done))

  async function fetchAll() {
    if (import.meta.client && ssrFetched.value) {
      ssrFetched.value = false
      return
    }
    const [c, p, t, g] = await Promise.all([
      requestFetch<ClientDto[]>('/api/clients'),
      requestFetch<ProjectDto[]>('/api/projects'),
      requestFetch<TaskDto[]>('/api/tasks'),
      requestFetch<TagDto[]>('/api/tags')
    ])
    clients.value = c
    projects.value = p
    tasks.value = t
    tags.value = g
    loaded.value = true
    if (import.meta.server) ssrFetched.value = true
  }

  // ── Clients ──────────────────────────────────────────────────────────────
  async function createClient(payload: ClientPayload) {
    const dto = await $fetch<ClientDto>('/api/clients', { method: 'POST', body: payload })
    await fetchAll()
    return dto
  }

  async function updateClient(id: string, patch: Partial<ClientPayload>) {
    const dto = await $fetch<ClientDto>(`/api/clients/${id}`, { method: 'PATCH', body: patch })
    await fetchAll()
    return dto
  }

  /** DELETE /api/clients/:id with cascade flags (Rule 3) → DeleteResult for the undo toast. */
  async function removeClient(id: string, cascade: { cascadeProjects: boolean, cascadeTasks: boolean, cascadeEntries: boolean }) {
    const result = await $fetch<CascadeDeleteResult>(`/api/clients/${id}`, { method: 'DELETE', body: cascade })
    await fetchAll()
    return result
  }

  function clientCascade(id: string) {
    return $fetch<CascadeCounts>(`/api/clients/${id}/cascade`)
  }

  // ── Projects ─────────────────────────────────────────────────────────────
  async function createProject(payload: ProjectPayload) {
    const dto = await $fetch<ProjectDto>('/api/projects', { method: 'POST', body: payload })
    await fetchAll()
    return dto
  }

  async function updateProject(id: string, patch: Partial<ProjectPayload>) {
    const dto = await $fetch<ProjectDto>(`/api/projects/${id}`, { method: 'PATCH', body: patch })
    await fetchAll()
    return dto
  }

  async function removeProject(id: string, cascade: { cascadeTasks: boolean, cascadeEntries: boolean }) {
    const result = await $fetch<CascadeDeleteResult>(`/api/projects/${id}`, { method: 'DELETE', body: cascade })
    await fetchAll()
    return result
  }

  function projectCascade(id: string) {
    return $fetch<CascadeCounts>(`/api/projects/${id}/cascade`)
  }

  // ── Tasks ────────────────────────────────────────────────────────────────
  async function createTask(payload: TaskPayload) {
    const dto = await $fetch<TaskDto>('/api/tasks', { method: 'POST', body: payload })
    await fetchAll()
    return dto
  }

  async function updateTask(id: string, patch: Partial<TaskPayload>) {
    const dto = await $fetch<TaskDto>(`/api/tasks/${id}`, { method: 'PATCH', body: patch })
    await fetchAll()
    return dto
  }

  async function removeTask(id: string) {
    const result = await $fetch<CascadeDeleteResult>(`/api/tasks/${id}`, { method: 'DELETE' })
    await fetchAll()
    return result
  }

  // ── Tags ─────────────────────────────────────────────────────────────────
  async function createTag(name: string) {
    const clean = name.trim().replace(/^#/, '').toLowerCase()
    if (!clean) return null
    const dto = await $fetch<TagDto>('/api/tags', { method: 'POST', body: { name: clean } })
    await fetchAll()
    return dto
  }

  /** Tag delete strips labels from entries only — never touches time. Returns the pre-delete TagDto. */
  async function removeTag(id: string) {
    const result = await $fetch<TagDto>(`/api/tags/${id}`, { method: 'DELETE' })
    await fetchAll()
    return result
  }

  return {
    clients,
    projects,
    tasks,
    tags,
    loaded,
    ssrFetched,
    openTasks,
    fetchAll,
    createClient,
    updateClient,
    removeClient,
    clientCascade,
    createProject,
    updateProject,
    removeProject,
    projectCascade,
    createTask,
    updateTask,
    removeTask,
    createTag,
    removeTag
  }
})
