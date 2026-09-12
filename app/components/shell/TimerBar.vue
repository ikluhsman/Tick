<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const timer = useTimerStore()
const entries = useEntriesStore()
const catalog = useCatalogStore()
const ui = useUiStore()
const router = useRouter()

// ── Description input ──────────────────────────────────────────────────────
const nameLocal = ref(timer.currentName)

watch(() => timer.currentName, (v) => {
  if (v !== nameLocal.value) nameLocal.value = v
})

let nameDebounce: ReturnType<typeof setTimeout> | null = null

function onNameInput(e: Event) {
  nameLocal.value = (e.target as HTMLInputElement).value
  if (!timer.running) {
    timer.setName(nameLocal.value)
    return
  }
  if (nameDebounce) clearTimeout(nameDebounce)
  nameDebounce = setTimeout(() => timer.setName(nameLocal.value), 800)
}

function flushName() {
  if (nameDebounce) {
    clearTimeout(nameDebounce)
    nameDebounce = null
  }
  timer.setName(nameLocal.value)
}

// ── Chain chip ─────────────────────────────────────────────────────────────
const chainLabel = computed(() => {
  const r = timer.currentRef
  if (!r) return ''
  return [r.taskName, r.projectName, r.clientName].filter(Boolean).join(' · ')
})

// ── "+" menu (opens PickerModal via ui store) ──────────────────────────────
type PlusItem = DropdownMenuItem & { count?: string }

const plusItems = computed<PlusItem[][]>(() => [[
  {
    label: 'Client',
    icon: 'i-lucide-user',
    count: String(catalog.clients.length),
    onSelect: () => ui.openPicker('timer', 'client')
  },
  {
    label: 'Project',
    icon: 'i-lucide-folder',
    count: String(catalog.projects.length),
    onSelect: () => ui.openPicker('timer', 'project')
  },
  {
    label: 'Task',
    icon: 'i-lucide-circle-check',
    count: `${catalog.openTasks.length} open`,
    onSelect: () => ui.openPicker('timer', 'task')
  }
]])

// ── Billable / rate ────────────────────────────────────────────────────────
const rateLabel = computed(() => {
  if (!timer.billable) return 'Not billable'
  return timer.resolvedRate != null ? `$${timer.resolvedRate}/h` : 'Billable'
})

// ── Clock ──────────────────────────────────────────────────────────────────
const clock = computed(() => {
  const s = timer.elapsedSec
  const h = String(Math.floor(s / 3600)).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const sec = String(s % 60).padStart(2, '0')
  return `${h}:${m}:${sec}`
})

// ── Start / stop ───────────────────────────────────────────────────────────
async function toggle() {
  try {
    if (timer.running) {
      flushName()
      const dto = await timer.stop()
      if (dto) {
        // <1s elapsed returns null (discarded); otherwise insert at top of Today
        entries.applyStoppedEntry(dto)
        router.push('/time')
      }
    } else {
      timer.setName(nameLocal.value)
      await timer.start()
    }
  } catch {
    // e.g. 409 timer already running elsewhere — re-sync with the server
    await timer.hydrate()
  }
}
</script>

<template>
  <div
    class="sticky top-0 z-20 border-b border-default px-[22px] py-[11px] backdrop-blur-[12px]"
    :style="{ background: 'color-mix(in srgb, var(--ui-bg) 86%, transparent)' }"
  >
    <div class="flex items-center gap-2 rounded-lg border border-default bg-elevated py-1.5 pr-1.5 pl-3.5 shadow-sm">
      <!-- Description -->
      <input
        :value="nameLocal"
        type="text"
        placeholder="What are you working on?"
        aria-label="What are you working on?"
        class="min-h-10 min-w-0 flex-1 bg-transparent text-[15px] text-highlighted outline-none placeholder:text-dimmed"
        @input="onNameInput"
        @change="flushName"
        @keydown.enter.prevent="toggle"
      >

      <!-- Chain chip: Task · Project · Client, one removable unit -->
      <span
        v-if="chainLabel"
        class="flex max-w-[360px] items-center gap-1.5 rounded-sm bg-primary/10 py-1 pr-[5px] pl-2.5 text-xs text-primary ring-1 ring-primary/25 ring-inset"
      >
        <span class="truncate">{{ chainLabel }}</span>
        <button
          type="button"
          aria-label="Remove client, project or task"
          class="flex size-[18px] shrink-0 items-center justify-center rounded-xs bg-primary/20 transition-colors hover:bg-primary/30"
          @click="timer.detach()"
        >
          <UIcon name="i-lucide-x" class="size-2.5" />
        </button>
      </span>

      <!-- + menu -->
      <UDropdownMenu :items="plusItems" :content="{ align: 'end' }" :ui="{ content: 'min-w-[230px]' }">
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          square
          aria-label="Add client, project or task"
          class="size-[34px] justify-center"
        />
        <template #item-trailing="{ item }">
          <span class="text-[11px] text-dimmed tnum">{{ item.count }}</span>
        </template>
        <template #content-bottom>
          <div class="mt-0.5 border-t border-default px-2.5 py-1.5 text-[11px] text-dimmed">
            Type <b class="font-medium text-toned">#</b> for tags, <b class="font-medium text-toned">@</b> for projects
          </div>
        </template>
      </UDropdownMenu>

      <!-- Billable toggle -->
      <UButton
        :color="timer.billable ? 'primary' : 'neutral'"
        variant="outline"
        icon="i-lucide-dollar-sign"
        :aria-pressed="timer.billable"
        :title="timer.billable ? 'Billable' : 'Not billable'"
        :class="timer.billable ? '' : 'text-dimmed'"
        class="h-[34px] gap-1.5 px-2.5 text-[13px]"
        @click="timer.toggleBillable()"
      >
        <span class="tnum">{{ rateLabel }}</span>
      </UButton>

      <!-- Clock -->
      <div
        class="tnum min-w-[118px] pr-1.5 text-right text-2xl font-medium tracking-[0.01em]"
        :class="timer.running ? 'text-primary-400 dark:text-primary-300' : 'text-dimmed'"
      >
        {{ clock }}
      </div>

      <!-- Start / stop: 40px circle, always outlined -->
      <UButton
        color="primary"
        variant="outline"
        square
        :icon="timer.running ? 'i-lucide-square' : 'i-lucide-play'"
        :aria-label="timer.running ? 'Stop' : 'Start'"
        class="size-10 justify-center rounded-full"
        :class="timer.running ? 'tick-glow text-primary-400 dark:text-primary-300' : ''"
        @click="toggle"
      />
    </div>
  </div>
</template>
