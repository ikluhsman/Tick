<script setup lang="ts">
// Collapsible project card — header grid `1fr | 220px | 90px | 24px`:
// client dot + name + billable tag with rate-source subline, tracked-vs-estimate
// progress, amount, chevron. Expanded: task rows + "+ Add task" ghost.

const props = defineProps<{ project: ProjectDto, tasks: TaskDto[] }>()

const emit = defineEmits<{
  'edit': []
  'delete': []
  'add-task': []
  'edit-task': [task: TaskDto]
}>()

const open = ref(false)

// Rate-source wording: "$95/h" · "$110/h from client" · "$85/h default" (Rule 2)
const rateLabel = computed(() => {
  const p = props.project
  if (p.resolvedRate == null || p.rateSource === 'none') return 'no rate'
  const base = `$${p.resolvedRate}/h`
  if (p.rateSource === 'project') return base
  if (p.rateSource === 'client') return `${base} from client`
  return `${base} default`
})

const subline = computed(() => {
  const p = props.project
  const total = p.openTasks + p.doneTasks
  return `${p.clientName ?? 'No client'} · ${p.openTasks}/${total} tasks open · ${rateLabel.value}`
})

// Progress: tracked vs estimate; primary, primary-300 when over the estimate
const trackedHours = computed(() => props.project.trackedSec / 3600)
const estimateHours = computed(() => props.project.estimateMinutes ? props.project.estimateMinutes / 60 : null)
const overEstimate = computed(() => estimateHours.value != null && trackedHours.value > estimateHours.value)

const progressPct = computed(() => {
  if (estimateHours.value) return Math.min(100, (trackedHours.value / estimateHours.value) * 100)
  return props.project.trackedSec ? 100 : 0
})

const estimateLabel = computed(() =>
  props.project.estimateMinutes ? `${formatEstimate(props.project.estimateMinutes)} estimated` : 'no estimate'
)

const amountLabel = computed(() =>
  props.project.billableDefault && props.project.amount ? formatMoney(props.project.amount) : ''
)
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default bg-elevated shadow-sm">
    <!-- Header (click to expand) -->
    <button
      type="button"
      class="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_220px_90px_24px] items-center gap-[22px] px-[22px] py-3 text-left transition-colors hover:bg-accented/30"
      :aria-expanded="open"
      @click="open = !open"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span
            class="size-2 shrink-0 rounded-full"
            :style="{ background: clientColorVar(project.clientColor, 'var(--ui-color-neutral-400)') }"
          />
          <span class="truncate text-[15px] font-medium text-highlighted">{{ project.name }}</span>
          <UBadge color="neutral" variant="soft" size="sm" class="text-[10px]">
            {{ project.billableDefault ? 'billable' : 'internal' }}
          </UBadge>
        </div>
        <div class="ml-4 truncate text-xs text-muted">{{ subline }}</div>
      </div>

      <div>
        <div class="tnum mb-1 flex justify-between text-[11px] text-muted">
          <span>{{ formatDuration(project.trackedSec) }} tracked</span>
          <span>{{ estimateLabel }}</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-accented">
          <span
            class="block h-full rounded-full"
            :class="overEstimate ? 'bg-primary-300' : 'bg-primary'"
            :style="{ width: `${progressPct}%` }"
          />
        </div>
      </div>

      <div class="tnum text-right text-[13px] text-toned">{{ amountLabel }}</div>

      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 opacity-60 transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <!-- Expanded: task rows + footer actions -->
    <div v-if="open" class="flex flex-col px-[22px] pt-0.5 pb-[11px]">
      <div v-for="t in tasks" :key="t.id" class="border-t border-default">
        <ManageTaskRow :task="t" @edit="emit('edit-task', t)" />
      </div>

      <div class="mt-1.5 flex items-center justify-between" :class="tasks.length ? '' : 'border-t border-default pt-2'">
        <UButton
          color="primary"
          variant="ghost"
          size="xs"
          label="+ Add task"
          @click="emit('add-task')"
        />
        <div class="flex items-center gap-0.5">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-pencil"
            label="Edit"
            class="text-dimmed"
            @click="emit('edit')"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-trash-2"
            label="Delete"
            class="text-dimmed hover:text-primary"
            @click="emit('delete')"
          />
        </div>
      </div>
    </div>
  </div>
</template>
