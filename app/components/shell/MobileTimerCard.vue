<script setup lang="ts">
// Mobile docked timer card — sits above the tab bar on every screen (<1024px),
// replacing the desktop TimerBar. Row 1: description input, 22px tnum clock,
// 44px circular start/stop. Row 2: chain chip, rate chip, + button (opens the
// picker sheet). Same store wiring as ShellTimerBar.
const timer = useTimerStore()
const entries = useEntriesStore()
const ui = useUiStore()
const router = useRouter()

// ── Description input (debounced while running, same as TimerBar) ──────────
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

// ── Chips ──────────────────────────────────────────────────────────────────
const chainLabel = computed(() => {
  const r = timer.currentRef
  if (!r) return ''
  return [r.taskName, r.projectName, r.clientName].filter(Boolean).join(' · ')
})

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
        entries.applyStoppedEntry(dto)
        router.push('/time')
      }
    } else {
      timer.setName(nameLocal.value)
      await timer.start()
    }
  } catch {
    await timer.hydrate()
  }
}
</script>

<template>
  <div class="mx-3 flex flex-col gap-2 rounded-lg border border-default bg-elevated py-2.5 pr-2.5 pl-3.5 shadow-md">
    <!-- Row 1: description · clock · start/stop -->
    <div class="flex items-center gap-2">
      <input
        :value="nameLocal"
        type="text"
        placeholder="What are you working on?"
        aria-label="What are you working on?"
        class="min-h-11 min-w-0 flex-1 bg-transparent text-[15px] text-highlighted outline-none placeholder:text-dimmed"
        @input="onNameInput"
        @change="flushName"
        @keydown.enter.prevent="toggle"
      >
      <span
        class="tnum shrink-0 text-[22px] font-medium tracking-[0.01em]"
        :class="timer.running ? 'text-primary-400 dark:text-primary-300' : 'text-dimmed'"
      >
        {{ clock }}
      </span>
      <UButton
        color="primary"
        variant="outline"
        square
        :icon="timer.running ? 'i-lucide-square' : 'i-lucide-play'"
        :aria-label="timer.running ? 'Stop' : 'Start'"
        class="size-11 shrink-0 justify-center rounded-full"
        :class="timer.running ? 'tick-glow text-primary-400 dark:text-primary-300' : ''"
        @click="toggle"
      />
    </div>

    <!-- Row 2: chain chip · rate chip · + -->
    <div class="flex min-w-0 items-center gap-1.5">
      <span
        v-if="chainLabel"
        class="flex min-w-0 items-center gap-1.5 rounded-sm bg-primary/10 py-1 pr-[5px] pl-2.5 text-[11px] text-primary ring-1 ring-primary/25 ring-inset"
      >
        <span class="truncate">{{ chainLabel }}</span>
        <button
          type="button"
          aria-label="Remove client, project or task"
          class="relative flex size-[18px] shrink-0 items-center justify-center rounded-xs bg-primary/20 after:absolute after:-inset-3 after:content-['']"
          @click="timer.detach()"
        >
          <UIcon name="i-lucide-x" class="size-2.5" />
        </button>
      </span>
      <span v-else class="text-[11px] text-dimmed">No client, project or task</span>

      <UBadge
        color="neutral"
        variant="outline"
        class="tnum shrink-0 cursor-pointer px-2 py-0.5 text-[11px]"
        :class="timer.billable ? 'text-primary ring-primary/40' : 'text-dimmed'"
        role="button"
        tabindex="0"
        :aria-pressed="timer.billable"
        :aria-label="timer.billable ? 'Billable — tap to make non-billable' : 'Not billable — tap to make billable'"
        as="button"
        @click="timer.toggleBillable()"
      >
        {{ rateLabel }}
      </UBadge>

      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        square
        aria-label="Add client, project or task"
        class="relative ml-auto size-[30px] shrink-0 justify-center after:absolute after:-inset-2 after:content-['']"
        :ui="{ leadingIcon: 'size-3.5' }"
        @click="ui.openPicker('timer', 'task')"
      />
    </div>
  </div>
</template>
