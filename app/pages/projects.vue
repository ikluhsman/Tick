<script setup lang="ts">
// Projects & tasks — header counts + New task / New project, collapsible project
// cards, Standalone tasks card (README "Projects & tasks").

const catalog = useCatalogStore()
const ui = useUiStore()

useHead({ title: 'Projects & tasks · Tick' })

// SSR-hydrated catalog: fetched on the server (state rides the Pinia payload;
// the layout's on-mount fetchAll() skips once via catalog.ssrFetched) and
// refreshed on later client-side visits.
await useAsyncData('catalog', async () => {
  await catalog.fetchAll()
  return true
})

const projects = computed(() => catalog.projects.filter(p => !p.archived))

const summary = computed(() => {
  const open = catalog.tasks.filter(t => !t.done).length
  const done = catalog.tasks.length - open
  const n = projects.value.length
  return `${n} project${n === 1 ? '' : 's'} · ${open} open task${open === 1 ? '' : 's'} · ${done} done`
})

const tasksOf = (projectId: string) => catalog.tasks.filter(t => t.projectId === projectId)
const standalone = computed(() => catalog.tasks.filter(t => !t.projectId))

// ── Form modals ────────────────────────────────────────────────────────────
const projectForm = ref<{ open: boolean, project: ProjectDto | null }>({ open: false, project: null })

const taskForm = ref<{ open: boolean, task: TaskDto | null, presetProjectId: string | null }>({
  open: false,
  task: null,
  presetProjectId: null
})

function openProjectForm(project: ProjectDto | null) {
  projectForm.value = { open: true, project }
}

function openTaskForm(task: TaskDto | null, presetProjectId: string | null = null) {
  taskForm.value = { open: true, task, presetProjectId }
}
</script>

<template>
  <div class="flex w-full max-w-[1100px] flex-col gap-[22px] px-[22px] pt-[22px] pb-[120px]">
    <!-- Header -->
    <div class="flex items-end gap-[11px]">
      <div class="min-w-0 flex-1">
        <h1 class="text-[28px] leading-tight font-medium text-highlighted">Projects & tasks</h1>
        <div class="text-[13px] text-muted">{{ summary }}</div>
      </div>
      <UButton color="neutral" variant="outline" label="New task" @click="openTaskForm(null)" />
      <UButton color="primary" variant="outline" label="New project" @click="openProjectForm(null)" />
    </div>

    <!-- Project cards -->
    <ManageProjectCard
      v-for="p in projects"
      :key="p.id"
      :project="p"
      :tasks="tasksOf(p.id)"
      @edit="openProjectForm(p)"
      @delete="ui.openCascade('project', p.id)"
      @add-task="openTaskForm(null, p.id)"
      @edit-task="openTaskForm($event)"
    />

    <div
      v-if="!projects.length"
      class="rounded-lg border border-default bg-elevated px-[22px] py-8 text-center text-[13px] text-muted shadow-sm"
    >
      No projects yet — create one with <span class="text-toned">New project</span> above.
    </div>

    <!-- Standalone tasks -->
    <div class="flex flex-col gap-2">
      <div class="flex items-baseline gap-2 px-1.5">
        <h3 class="text-base font-medium text-highlighted">Standalone tasks</h3>
        <span class="text-xs text-muted">no project — still billable if you say so</span>
      </div>
      <div class="rounded-lg border border-default bg-elevated px-[22px] py-1 shadow-sm">
        <template v-if="standalone.length">
          <div
            v-for="(t, i) in standalone"
            :key="t.id"
            :class="i ? 'border-t border-default' : ''"
          >
            <ManageTaskRow :task="t" @edit="openTaskForm(t)" />
          </div>
        </template>
        <p v-else class="py-2 text-xs text-muted">
          Nothing standalone — every task lives in a project.
        </p>
      </div>
    </div>

    <ManageProjectFormModal v-model:open="projectForm.open" :project="projectForm.project" />
    <ManageTaskFormModal
      v-model:open="taskForm.open"
      :task="taskForm.task"
      :preset-project-id="taskForm.presetProjectId"
    />
    <ManageCascadeDeleteDialog />
  </div>
</template>
