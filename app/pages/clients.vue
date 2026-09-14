<script setup lang="ts">
// Clients — table card: avatar w/ initials in client color, rate (muted
// "(default)" fallback), projects/tasks counts, tracked + amount, edit / delete.
// Delete → cascade dialog (Rule 3).

const catalog = useCatalogStore()
const ui = useUiStore()
const session = useUserSession()

useHead({ title: 'Clients · Tick' })

// SSR-hydrated catalog: fetched on the server (state rides the Pinia payload;
// the layout's on-mount fetchAll() skips once via catalog.ssrFetched) and
// refreshed on later client-side visits.
await useAsyncData('catalog', async () => {
  await catalog.fetchAll()
  return true
})

const userRate = computed(() => (session.user.value as SessionUser | null)?.defaultRate ?? null)

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const clientForm = ref<{ open: boolean, client: ClientDto | null }>({ open: false, client: null })

function openClientForm(client: ClientDto | null) {
  clientForm.value = { open: true, client }
}
</script>

<template>
  <div class="flex w-full max-w-[1100px] flex-col gap-[22px] px-[22px] pt-[22px] pb-[120px]">
    <!-- Header -->
    <div class="flex items-end gap-[11px]">
      <div class="min-w-0 flex-1">
        <h1 class="text-[28px] leading-tight font-medium text-highlighted">Clients</h1>
        <div class="text-[13px] text-muted">Rates set here are inherited by projects without their own rate.</div>
      </div>
      <UButton color="primary" variant="outline" label="New client" @click="openClientForm(null)" />
    </div>

    <!-- Table card -->
    <div class="overflow-hidden rounded-lg border border-default bg-elevated shadow-sm">
      <div role="table" aria-label="Clients">
        <div
          role="row"
          class="hidden gap-[11px] border-b border-default px-[22px] py-2 text-[10px] tracking-[0.08em] text-muted uppercase sm:grid sm:grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr_1fr_70px]"
        >
          <span role="columnheader">Client</span>
          <span role="columnheader">Rate</span>
          <span role="columnheader">Projects</span>
          <span role="columnheader">Tasks</span>
          <span role="columnheader">Tracked</span>
          <span role="columnheader"><span class="sr-only">Actions</span></span>
        </div>

        <!-- Below sm: name on its own line, secondary figures stacked underneath in
             a muted sub-line, actions kept on their own reachable line. The middle
             four cells stay individual role="cell" elements (`display: contents`
             turns their wrapper into a no-op at sm+ so they land back in their own
             grid tracks, matching the header above exactly). -->
        <div
          v-for="c in catalog.clients"
          :key="c.id"
          role="row"
          class="flex flex-col gap-1 border-b border-default px-[22px] py-[11px] text-[13px] transition-colors last:border-0 hover:bg-accented/30 sm:grid sm:grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr_1fr_70px] sm:items-center sm:gap-[11px]"
        >
          <div class="flex min-w-0 items-center gap-2.5" role="cell">
            <span
              aria-hidden="true"
              class="tick-on-swatch grid size-[26px] shrink-0 place-items-center rounded-full text-[10px] font-semibold"
              :style="{ '--client-bg': clientColorVar(c.color) }"
            >
              {{ initials(c.name) }}
            </span>
            <span class="truncate text-sm font-medium text-highlighted">{{ c.name }}</span>
          </div>

          <div class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 sm:contents">
            <span
              class="tnum text-xs text-muted sm:text-[13px]"
              :class="c.rate != null ? 'sm:text-default' : ''"
              role="cell"
            >
              <template v-if="c.rate != null">${{ c.rate }}/h</template>
              <template v-else-if="userRate != null">${{ userRate }}/h (default)</template>
              <template v-else>— (default)</template>
            </span>

            <span class="tnum text-xs text-muted sm:text-[13px] sm:text-default" role="cell">
              {{ c.projectCount }}<span class="sm:hidden"> {{ c.projectCount === 1 ? 'project' : 'projects' }}</span>
            </span>
            <span class="tnum text-xs text-muted sm:text-[13px] sm:text-default" role="cell">
              {{ c.taskCount }}<span class="sm:hidden"> {{ c.taskCount === 1 ? 'task' : 'tasks' }}</span>
            </span>

            <span class="tnum text-xs text-muted sm:text-[13px] sm:text-default" role="cell">
              {{ formatDuration(c.trackedSec) }}
              <span class="text-muted"> · {{ formatMoney(c.amount) }}</span>
            </span>
          </div>

          <div class="flex justify-end gap-0.5" role="cell">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              square
              title="Edit"
              aria-label="Edit client"
              class="size-[30px] justify-center"
              @click="openClientForm(c)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              square
              title="Delete"
              aria-label="Delete client"
              class="size-[30px] justify-center text-dimmed hover:text-primary"
              @click="ui.openCascade('client', c.id)"
            />
          </div>
        </div>

      </div>

      <p v-if="!catalog.clients.length" class="px-[22px] py-8 text-center text-[13px] text-muted">
        No clients yet — create one with <span class="text-toned">New client</span> above.
      </p>
    </div>

    <ManageClientFormModal v-model:open="clientForm.open" :client="clientForm.client" />
    <ManageCascadeDeleteDialog />
  </div>
</template>
