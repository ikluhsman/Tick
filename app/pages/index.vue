<script setup lang="ts">
// Dashboard: greeting, stat cards, activity grid + billable donut, week bars.
// Cards can be shown/hidden via the Customize menu (persisted to localStorage).
import type { DropdownMenuItem } from '@nuxt/ui'
import type { DashboardCards } from '~/composables/useDashboard'

useHead({ title: 'Dashboard · Tick' })

const { user } = useUserSession()
const { summary, pending, error, refresh } = useDashboard()
const { cards, hydrateCards, setCard } = useDashboardCards()

onMounted(hydrateCards)

// ── Greeting ───────────────────────────────────────────────────────────────
const firstName = computed(() => {
  const name = (user.value as SessionUser | null)?.name ?? ''
  return name.split(' ')[0] || 'there'
})

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
})

const dateLine = computed(() =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
)

// ── Customize menu (show/hide cards) ───────────────────────────────────────
const cardDefs: { key: keyof DashboardCards, label: string }[] = [
  { key: 'stats', label: 'Stat cards' },
  { key: 'activity', label: 'Activity' },
  { key: 'billable', label: 'Billable this week' },
  { key: 'week', label: 'This week' }
]

const customizeItems = computed<DropdownMenuItem[]>(() =>
  cardDefs.map(def => ({
    label: def.label,
    type: 'checkbox' as const,
    checked: cards.value[def.key],
    onUpdateChecked: (checked: boolean) => setCard(def.key, checked),
    onSelect: (e: Event) => e.preventDefault() // keep the menu open while toggling
  }))
)
</script>

<template>
  <section class="flex w-full max-w-275 flex-col gap-4.25 px-5.5 pt-5.5 pb-30">
    <!-- Greeting + Customize -->
    <div class="flex items-end gap-4">
      <div class="min-w-0 flex-1">
        <h1 class="text-[28px] font-medium leading-tight text-highlighted">
          {{ greeting }}, {{ firstName }}
        </h1>
        <div class="text-[13px] text-muted">{{ dateLine }}</div>
      </div>
      <UDropdownMenu :items="customizeItems" :content="{ align: 'end' }" :ui="{ content: 'min-w-50' }">
        <UButton
          label="Customize"
          icon="i-lucide-sliders-horizontal"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </UDropdownMenu>
    </div>

    <!-- Loading skeleton (first visit only) -->
    <div
      v-if="pending && !summary"
      class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3"
    >
      <USkeleton v-for="i in 4" :key="i" class="h-22 rounded-lg" />
    </div>

    <!-- Load failure -->
    <UAlert
      v-else-if="error && !summary"
      color="neutral"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Couldn't load your dashboard"
      description="The summary request failed. Check your connection and try again."
      :actions="[{ label: 'Retry', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else-if="summary">
      <DashboardStatCards v-if="cards.stats" :summary="summary" />

      <!-- Mobile stacks stats → week bars → activity (README §Mobile); desktop keeps design order -->
      <div
        v-if="cards.activity || cards.billable"
        class="grid gap-3 max-lg:order-2"
        :class="cards.activity && cards.billable ? 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]' : ''"
      >
        <DashboardActivityGrid v-if="cards.activity" :summary="summary" />
        <DashboardBillableDonut v-if="cards.billable" :summary="summary" />
      </div>

      <DashboardWeekBars v-if="cards.week" :summary="summary" class="max-lg:order-1" />

      <div
        v-if="!cards.stats && !cards.activity && !cards.billable && !cards.week"
        class="rounded-lg border border-dashed border-default px-4 py-8 text-center text-[13px] text-muted"
      >
        All cards are hidden — bring them back with Customize.
      </div>
    </template>
  </section>
</template>
