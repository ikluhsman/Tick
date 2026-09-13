<script setup lang="ts">
// One task row — used inside a project card and in the Standalone tasks card.
// Grid: done radio | name | entry count | tracked | ▶ start (README "Projects & tasks").

const props = defineProps<{ task: TaskDto }>()
const emit = defineEmits<{ edit: [] }>()

const timer = useTimerStore()
const entriesStore = useEntriesStore()
const catalog = useCatalogStore()
const router = useRouter()

const entriesLabel = computed(() => {
  const n = props.task.entryCount
  return n ? `${n} ${n === 1 ? 'entry' : 'entries'}` : 'no entries'
})

const tracked = computed(() => props.task.trackedSec ? formatDuration(props.task.trackedSec) : '—')

async function toggleDone() {
  try {
    await catalog.updateTask(props.task.id, { done: !props.task.done })
  } catch { /* refetch happens inside the store on success; ignore transient errors */ }
}

// ▶ — copies name/ref/billable onto the timer and starts (stops a running timer first).
const starting = ref(false)

async function start() {
  if (starting.value) return
  starting.value = true
  try {
    if (timer.running) {
      const dto = await timer.stop()
      if (dto) entriesStore.applyStoppedEntry(dto)
    }
    const billable = props.task.projectId
      ? (catalog.projects.find(p => p.id === props.task.projectId)?.billableDefault ?? true)
      : true
    await timer.start({ name: props.task.name, refType: 'task', refId: props.task.id, billable })
    router.push('/time')
  } catch {
    await timer.hydrate()
  } finally {
    starting.value = false
  }
}
</script>

<template>
  <div class="grid grid-cols-[22px_minmax(0,1fr)_110px_80px_30px] items-center gap-[11px] py-[7px] pl-2">
    <!-- Done radio: accent when done -->
    <button
      type="button"
      :aria-label="task.done ? 'Reopen task' : 'Mark complete'"
      class="grid size-4 cursor-pointer place-items-center rounded-full border-[1.5px] transition-colors"
      :class="task.done ? 'border-primary bg-primary text-inverted' : 'border-accented hover:border-primary'"
      @click="toggleDone"
    >
      <UIcon v-if="task.done" name="i-lucide-check" class="size-2.5" />
    </button>

    <!-- Name: struck through when done; click to edit. Own rate (if any) shows right after it. -->
    <button
      type="button"
      class="flex min-w-0 items-baseline gap-1.5 text-left text-[13px] decoration-dotted underline-offset-2 hover:underline"
      :class="task.done ? 'text-muted line-through' : 'text-default'"
      @click="emit('edit')"
    >
      <span class="truncate">{{ task.name }}</span>
      <span v-if="task.rate != null" class="tnum shrink-0 text-xs text-muted">${{ task.rate }}/h</span>
    </button>

    <span class="text-xs text-muted">{{ entriesLabel }}</span>

    <span class="tnum text-right text-xs text-toned">{{ tracked }}</span>

    <UButton
      icon="i-lucide-play"
      color="neutral"
      variant="ghost"
      square
      :loading="starting"
      title="Start timer on this task"
      aria-label="Start timer on this task"
      class="size-7 justify-center"
      @click="start"
    />
  </div>
</template>
