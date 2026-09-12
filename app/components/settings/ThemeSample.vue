<script setup lang="ts">
// Live sample card (right column, sticky): everything here is built from
// semantic tokens so it re-renders the instant the theme store applies a
// change — mini timer bar, the three button variants, an input, three
// billable/non-billable bars and the primary 100–900 ramp, plus the
// generated app.config.ts snippet.
const theme = useThemeStore()

const bars = [
  { label: 'Mon', a: 56, b: 22, h: '6.3h' },
  { label: 'Tue', a: 65, b: 15, h: '6.4h' },
  { label: 'Wed', a: 44, b: 8, h: '4.1h' }
]

const ramp = [100, 200, 300, 400, 500, 600, 700, 800, 900]
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Sample card -->
    <div class="flex flex-col gap-4 rounded-lg border border-default bg-elevated p-4 shadow-sm">
      <div class="flex items-center gap-2">
        <div class="flex-1 text-[15px] font-medium text-highlighted">Sample</div>
        <UBadge color="primary" variant="subtle" size="sm">billable</UBadge>
        <UBadge color="neutral" variant="subtle" size="sm">#design</UBadge>
      </div>

      <!-- Mini timer bar -->
      <div class="flex items-center gap-2 rounded-lg bg-default py-1.5 pr-1.5 pl-3 shadow-sm">
        <span class="flex-1 truncate text-sm text-dimmed">What are you working on?</span>
        <span class="tnum text-lg font-medium text-dimmed">00:00:00</span>
        <UButton
          color="primary"
          variant="outline"
          square
          icon="i-lucide-play"
          aria-label="Sample start button"
          class="size-[34px] justify-center rounded-full"
        />
      </div>

      <!-- Button variants -->
      <div class="flex gap-2">
        <UButton color="primary" variant="outline">Primary</UButton>
        <UButton color="neutral" variant="outline">Secondary</UButton>
        <UButton color="neutral" variant="ghost">Ghost</UButton>
      </div>

      <!-- Input -->
      <UInput model-value="Hero layout pass" readonly placeholder="Input" aria-label="Sample input" />

      <!-- Bars -->
      <div class="flex flex-col gap-1.5">
        <div
          v-for="d in bars"
          :key="d.label"
          class="grid grid-cols-[30px_minmax(0,1fr)_40px] items-center gap-2.5 text-xs"
        >
          <span class="text-dimmed">{{ d.label }}</span>
          <div class="flex h-2 gap-[2px] overflow-hidden rounded-full bg-accented">
            <span
              class="h-full rounded-full bg-primary"
              :style="{ width: `${d.a}%` }"
            />
            <span
              class="h-full rounded-full"
              :style="{ width: `${d.b}%`, background: 'var(--ui-color-neutral-500)' }"
            />
          </div>
          <span class="tnum text-right text-highlighted">{{ d.h }}</span>
        </div>
      </div>

      <!-- Primary 100–900 ramp -->
      <div class="flex gap-[3px]">
        <span
          v-for="n in ramp"
          :key="n"
          :title="`${theme.primary}-${n}`"
          class="h-3.5 flex-1 rounded-[3px]"
          :style="{ background: `var(--ui-color-primary-${n})` }"
        />
      </div>
    </div>

    <!-- Generated app.config.ts -->
    <div class="flex flex-col gap-1.5 rounded-lg border border-default bg-elevated px-4 py-3 shadow-sm">
      <div class="text-[10px] font-medium uppercase tracking-[0.1em] text-dimmed">app.config.ts</div>
      <pre class="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-toned">{{ theme.configText }}</pre>
    </div>
  </div>
</template>
