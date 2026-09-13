<script setup lang="ts">
// Settings → Import: bring entries in from Toggl / Clockify / a generic CSV.
// Three steps inside the tab: pick source + file → dry-run preview (nothing
// written) → confirm import → summary. Server matches existing catalog rows
// by lowercase name and creates the rest.
import type { ImportCommitResult, ImportPreview, ImportSource } from '#shared/types/import'

const toast = useToast()

const step = ref<'pick' | 'preview' | 'done'>('pick')
const source = ref<ImportSource>('toggl')
const file = ref<File | null>(null)
const csvText = ref('')
const preview = ref<ImportPreview | null>(null)
const summary = ref<ImportCommitResult | null>(null)
const loading = ref(false)

const sources: { value: ImportSource, title: string, icon: string, hint: string }[] = [
  {
    value: 'toggl',
    title: 'Toggl Track',
    icon: 'i-lucide-clock-4',
    hint: 'Reports → Detailed → Export → CSV. Keeps client, project, task, tags, billable and start/end times.'
  },
  {
    value: 'clockify',
    title: 'Clockify',
    icon: 'i-lucide-timer',
    hint: 'Reports → Detailed → Export → Save as CSV. Keeps project, client, task, tags, billable and times.'
  },
  {
    value: 'generic',
    title: 'Generic CSV',
    icon: 'i-lucide-file-spreadsheet',
    hint: 'Header row: name, start, end, client, project, task, tags, billable (optional rate). ISO datetimes, e.g. 2026-01-05T09:00:00.'
  }
]

function pickSource(s: ImportSource) {
  source.value = s
}

function reset() {
  step.value = 'pick'
  file.value = null
  csvText.value = ''
  preview.value = null
  summary.value = null
}

function apiError(err: unknown): string {
  const e = err as { data?: { message?: string }, message?: string }
  return e?.data?.message || e?.message || 'Something went wrong'
}

async function runPreview() {
  if (!file.value) return
  loading.value = true
  try {
    csvText.value = await file.value.text()
    preview.value = await $fetch<ImportPreview>('/api/import/preview', {
      method: 'POST',
      body: { source: source.value, csv: csvText.value }
    })
    step.value = 'preview'
  } catch (err) {
    toast.add({ title: "Couldn't read that file", description: apiError(err), icon: 'i-lucide-file-x-2', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function runCommit() {
  loading.value = true
  try {
    summary.value = await $fetch<ImportCommitResult>('/api/import/commit', {
      method: 'POST',
      body: { source: source.value, csv: csvText.value }
    })
    step.value = 'done'
    toast.add({
      title: `Imported ${summary.value.entries} ${summary.value.entries === 1 ? 'entry' : 'entries'}`,
      description: describeCreated(summary.value),
      icon: 'i-lucide-check-check',
      color: 'primary'
    })
  } catch (err) {
    toast.add({ title: 'Import failed — nothing was written', description: apiError(err), icon: 'i-lucide-circle-x', color: 'error' })
  } finally {
    loading.value = false
  }
}

function describeCreated(s: ImportCommitResult): string {
  const parts: string[] = []
  if (s.created.clients) parts.push(`${s.created.clients} client${s.created.clients > 1 ? 's' : ''}`)
  if (s.created.projects) parts.push(`${s.created.projects} project${s.created.projects > 1 ? 's' : ''}`)
  if (s.created.tasks) parts.push(`${s.created.tasks} task${s.created.tasks > 1 ? 's' : ''}`)
  if (s.created.tags) parts.push(`${s.created.tags} tag${s.created.tags > 1 ? 's' : ''}`)
  return parts.length ? `Created ${parts.join(', ')}.` : 'Everything matched your existing catalog.'
}

const catalogGroups = computed(() => {
  if (!preview.value) return []
  return [
    { label: 'Clients', items: preview.value.clients },
    { label: 'Projects', items: preview.value.projects },
    { label: 'Tasks', items: preview.value.tasks },
    { label: 'Tags', items: preview.value.tags }
  ]
})

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtStart(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function chainLabel(row: ImportPreview['rows'][number]): string {
  return [row.client, row.project, row.task].filter(Boolean).join(' › ') || '—'
}
</script>

<template>
  <div class="flex max-w-[760px] flex-col gap-[22px]">
    <!-- ── Step 1: source + file ─────────────────────────────────────────── -->
    <template v-if="step === 'pick'">
      <section class="flex flex-col gap-2.5">
        <div>
          <h2 class="text-[15px] font-medium text-highlighted">Where is your data coming from?</h2>
          <p class="text-xs text-muted">Import is a dry run first — you'll see exactly what gets created before anything is written.</p>
        </div>
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <SettingsImportSourceCard
            v-for="s in sources"
            :key="s.value"
            :title="s.title"
            :icon="s.icon"
            :hint="s.hint"
            :active="source === s.value"
            @select="pickSource(s.value)"
          />
        </div>
      </section>

      <section class="flex flex-col gap-2.5">
        <h2 class="text-[15px] font-medium text-highlighted">CSV file</h2>
        <UFileUpload
          v-model="file"
          accept=".csv,text/csv"
          icon="i-lucide-file-up"
          label="Drop your CSV here"
          description="or click to browse — up to 5MB"
          color="neutral"
          class="min-h-[120px]"
        />
        <div class="flex items-center gap-2">
          <UButton
            color="primary"
            variant="outline"
            icon="i-lucide-scan-search"
            :disabled="!file"
            :loading="loading"
            @click="runPreview"
          >
            Preview import
          </UButton>
          <span v-if="file" class="text-xs text-muted">Nothing is imported yet.</span>
        </div>
      </section>
    </template>

    <!-- ── Step 2: dry-run preview ───────────────────────────────────────── -->
    <template v-else-if="step === 'preview' && preview">
      <section class="flex flex-col gap-2.5">
        <div>
          <h2 class="text-[15px] font-medium text-highlighted">Preview — nothing written yet</h2>
          <p class="text-xs text-muted">Existing clients, projects, tasks and tags are matched by name; the rest get created.</p>
        </div>

        <!-- Counts -->
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div class="rounded-md border border-default bg-elevated px-3 py-2.5">
            <div class="text-[10px] font-medium tracking-[0.1em] text-muted uppercase">Entries</div>
            <div class="tnum text-[20px] font-medium text-highlighted">{{ preview.entryCount }}</div>
          </div>
          <div class="rounded-md border border-default bg-elevated px-3 py-2.5">
            <div class="text-[10px] font-medium tracking-[0.1em] text-muted uppercase">Date range</div>
            <div v-if="preview.dateRange" class="tnum text-[13px] font-medium text-highlighted">
              {{ fmtDay(preview.dateRange.from) }} – {{ fmtDay(preview.dateRange.to) }}
            </div>
            <div v-else class="text-[13px] text-muted">—</div>
          </div>
          <div class="rounded-md border border-default bg-elevated px-3 py-2.5">
            <div class="text-[10px] font-medium tracking-[0.1em] text-muted uppercase">Skipped rows</div>
            <div class="tnum text-[20px] font-medium" :class="preview.warnings.length ? 'text-highlighted' : 'text-muted'">
              {{ preview.warnings.length }}
            </div>
          </div>
        </div>

        <!-- Catalog diff -->
        <div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <div
            v-for="group in catalogGroups"
            :key="group.label"
            class="rounded-md border border-default bg-elevated px-3 py-2.5"
          >
            <div class="mb-1.5 text-[10px] font-medium tracking-[0.1em] text-muted uppercase">{{ group.label }}</div>
            <p v-if="!group.items.length" class="text-[12px] text-muted">None in file</p>
            <ul v-else class="flex flex-col gap-1">
              <li v-for="item in group.items" :key="item.name" class="flex items-center gap-1.5 text-[12px]">
                <span class="truncate text-default">{{ item.name }}</span>
                <UBadge
                  :color="item.existing ? 'neutral' : 'primary'"
                  variant="outline"
                  size="sm"
                  class="shrink-0"
                >
                  {{ item.existing ? 'existing' : 'new' }}
                </UBadge>
              </li>
            </ul>
          </div>
        </div>

        <!-- First rows -->
        <div class="overflow-hidden rounded-md border border-default bg-elevated">
          <div class="border-b border-default px-3 py-2 text-[10px] font-medium tracking-[0.1em] text-muted uppercase">
            First {{ preview.rows.length }} of {{ preview.entryCount }} entries
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[560px] text-left text-[12px]">
              <thead>
                <tr class="border-b border-default text-[10px] tracking-[0.08em] text-muted uppercase">
                  <th class="px-3 py-1.5 font-medium">Entry</th>
                  <th class="px-3 py-1.5 font-medium">Client › Project › Task</th>
                  <th class="px-3 py-1.5 font-medium">Tags</th>
                  <th class="px-3 py-1.5 font-medium">Start</th>
                  <th class="px-3 py-1.5 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in preview.rows" :key="i" class="border-b border-default last:border-0">
                  <td class="max-w-[180px] truncate px-3 py-1.5 text-default">
                    {{ row.name || '(no name)' }}
                    <span v-if="!row.billable" class="text-muted"> · non-billable</span>
                  </td>
                  <td class="max-w-[180px] truncate px-3 py-1.5 text-muted">{{ chainLabel(row) }}</td>
                  <td class="max-w-[120px] truncate px-3 py-1.5 text-muted">
                    {{ row.tags.length ? row.tags.map(t => `#${t}`).join(' ') : '—' }}
                  </td>
                  <td class="tnum px-3 py-1.5 whitespace-nowrap text-muted">{{ fmtStart(row.start) }}</td>
                  <td class="tnum px-3 py-1.5 text-right whitespace-nowrap text-default">{{ formatDuration(row.durationSec) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Warnings -->
        <UAlert
          v-if="preview.warnings.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`${preview.warnings.length} row${preview.warnings.length > 1 ? 's' : ''} will be skipped`"
        >
          <template #description>
            <ul class="flex flex-col gap-0.5">
              <li v-for="w in preview.warnings" :key="w.line" class="text-[12px]">
                <span class="tnum">Line {{ w.line }}</span> — {{ w.reason }}
              </li>
            </ul>
          </template>
        </UAlert>

        <div class="flex items-center gap-2">
          <UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" @click="reset">
            Back
          </UButton>
          <UButton
            color="primary"
            variant="outline"
            icon="i-lucide-download"
            :loading="loading"
            :disabled="!preview.entryCount"
            @click="runCommit"
          >
            Import {{ preview.entryCount }} {{ preview.entryCount === 1 ? 'entry' : 'entries' }}
          </UButton>
        </div>
      </section>
    </template>

    <!-- ── Step 3: done ──────────────────────────────────────────────────── -->
    <template v-else-if="step === 'done' && summary">
      <section class="flex flex-col gap-2.5">
        <div class="rounded-md border border-default bg-elevated px-4 py-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-check-check" class="size-5 text-primary" />
            <h2 class="text-[15px] font-medium text-highlighted">
              Imported {{ summary.entries }} {{ summary.entries === 1 ? 'entry' : 'entries' }}
            </h2>
          </div>
          <p v-if="summary.dateRange" class="tnum mt-1 text-[13px] text-muted">
            {{ fmtDay(summary.dateRange.from) }} – {{ fmtDay(summary.dateRange.to) }}
          </p>
          <p class="mt-2 text-[13px] text-default">{{ describeCreated(summary) }}</p>
          <p v-if="summary.skipped" class="mt-1 text-[13px] text-muted">
            {{ summary.skipped }} row{{ summary.skipped > 1 ? 's were' : ' was' }} skipped — see the warnings from the preview.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UButton color="primary" variant="outline" icon="i-lucide-rotate-ccw" @click="reset">
            Import another file
          </UButton>
          <UButton color="neutral" variant="outline" to="/time">
            View entries
          </UButton>
        </div>
      </section>
    </template>
  </div>
</template>
