// Rule 3's decision table: for every checkbox combination the delete dialog can
// send, which rows go to trash, which are kept and detached, and which refs the
// surviving entries lose. Pure — no database — so every combination is cheap to
// enumerate here rather than seeded one by one.
//
// server/utils/cascade.ts turns this plan into SQL; that half is proved against
// a real database in test/integration/cascade-sql.test.ts (ticktimer/Tick#13).
import { describe, expect, it } from 'vitest'
import {
  planClientCascade,
  planProjectCascade,
  type ClientCascadeFlags,
  type ProjectCascadeFlags,
  type Subtree
} from '../../server/utils/cascade-plan'

const CLIENT = 'client-1'
const PROJECT = 'project-1'

/** A client subtree: two projects, two tasks under them, three ended entries. */
const SUB: Subtree = {
  projectIds: ['project-a', 'project-b'],
  taskIds: ['task-a', 'task-b'],
  endedEntryIds: ['entry-1', 'entry-2', 'entry-3']
}

const EMPTY: Subtree = { projectIds: [], taskIds: [], endedEntryIds: [] }

function clientFlags(
  cascadeProjects: boolean,
  cascadeTasks: boolean,
  cascadeEntries: boolean
): ClientCascadeFlags {
  return { cascadeProjects, cascadeTasks, cascadeEntries }
}

function projectFlags(cascadeTasks: boolean, cascadeEntries: boolean): ProjectCascadeFlags {
  return { cascadeTasks, cascadeEntries }
}

/** The eight client combinations, written out rather than derived. */
const CLIENT_TABLE: {
  flags: ClientCascadeFlags
  label: string
  deletedProjects: string[]
  deletedTasks: string[]
  deletedEntries: string[]
  detachedProjects: string[]
  detachedTasks: string[]
}[] = [
  {
    label: 'nothing checked — only the client goes',
    flags: clientFlags(false, false, false),
    deletedProjects: [],
    deletedTasks: [],
    deletedEntries: [],
    detachedProjects: SUB.projectIds,
    // The projects survive, so their tasks keep pointing at them.
    detachedTasks: []
  },
  {
    label: 'entries only — time trashed, catalog intact',
    flags: clientFlags(false, false, true),
    deletedProjects: [],
    deletedTasks: [],
    deletedEntries: SUB.endedEntryIds,
    detachedProjects: SUB.projectIds,
    detachedTasks: []
  },
  {
    label: 'tasks only — projects survive, so nothing is orphaned',
    flags: clientFlags(false, true, false),
    deletedProjects: [],
    deletedTasks: SUB.taskIds,
    deletedEntries: [],
    detachedProjects: SUB.projectIds,
    detachedTasks: []
  },
  {
    label: 'tasks + entries, projects kept',
    flags: clientFlags(false, true, true),
    deletedProjects: [],
    deletedTasks: SUB.taskIds,
    deletedEntries: SUB.endedEntryIds,
    detachedProjects: SUB.projectIds,
    detachedTasks: []
  },
  {
    label: 'projects only — kept tasks become standalone',
    flags: clientFlags(true, false, false),
    deletedProjects: SUB.projectIds,
    deletedTasks: [],
    deletedEntries: [],
    detachedProjects: [],
    detachedTasks: SUB.taskIds
  },
  {
    label: 'projects + entries — kept tasks become standalone, time trashed',
    flags: clientFlags(true, false, true),
    deletedProjects: SUB.projectIds,
    deletedTasks: [],
    deletedEntries: SUB.endedEntryIds,
    detachedProjects: [],
    detachedTasks: SUB.taskIds
  },
  {
    label: 'projects + tasks — all time kept and detached',
    flags: clientFlags(true, true, false),
    deletedProjects: SUB.projectIds,
    deletedTasks: SUB.taskIds,
    deletedEntries: [],
    detachedProjects: [],
    detachedTasks: []
  },
  {
    label: 'everything checked — the whole subtree goes',
    flags: clientFlags(true, true, true),
    deletedProjects: SUB.projectIds,
    deletedTasks: SUB.taskIds,
    deletedEntries: SUB.endedEntryIds,
    detachedProjects: [],
    detachedTasks: []
  }
]

describe('planClientCascade — every checkbox combination', () => {
  for (const row of CLIENT_TABLE) {
    it(row.label, () => {
      const plan = planClientCascade(CLIENT, SUB, row.flags)
      expect(plan.deletedProjects).toEqual(row.deletedProjects)
      expect(plan.deletedTasks).toEqual(row.deletedTasks)
      expect(plan.deletedEntries).toEqual(row.deletedEntries)
      expect(plan.detachedProjects).toEqual(row.detachedProjects)
      expect(plan.detachedTasks).toEqual(row.detachedTasks)
    })
  }

  it('never both deletes and detaches the same row', () => {
    for (const row of CLIENT_TABLE) {
      const plan = planClientCascade(CLIENT, SUB, row.flags)
      for (const id of plan.detachedProjects) expect(plan.deletedProjects).not.toContain(id)
      for (const id of plan.detachedTasks) expect(plan.deletedTasks).not.toContain(id)
    }
  })

  it('clears refs to the client itself in every combination', () => {
    for (const row of CLIENT_TABLE) {
      const plan = planClientCascade(CLIENT, SUB, row.flags)
      expect(plan.clearedRefs.clientIds).toEqual([CLIENT])
    }
  })

  it('clears refs to exactly the rows it trashed — never to kept ones', () => {
    for (const row of CLIENT_TABLE) {
      const plan = planClientCascade(CLIENT, SUB, row.flags)
      expect(plan.clearedRefs.projectIds).toEqual(plan.deletedProjects)
      expect(plan.clearedRefs.taskIds).toEqual(plan.deletedTasks)
    }
  })

  it('plans nothing below an empty client but still clears refs to it', () => {
    const plan = planClientCascade(CLIENT, EMPTY, clientFlags(true, true, true))
    expect(plan.deletedProjects).toEqual([])
    expect(plan.deletedTasks).toEqual([])
    expect(plan.deletedEntries).toEqual([])
    expect(plan.detachedProjects).toEqual([])
    expect(plan.detachedTasks).toEqual([])
    expect(plan.clearedRefs).toEqual({ clientIds: [CLIENT], projectIds: [], taskIds: [] })
  })
})

describe('planProjectCascade — every checkbox combination', () => {
  // A project subtree carries no projects of its own.
  const sub: Subtree = { projectIds: [], taskIds: SUB.taskIds, endedEntryIds: SUB.endedEntryIds }

  it('nothing checked — tasks kept, left standalone', () => {
    const plan = planProjectCascade(PROJECT, sub, projectFlags(false, false))
    expect(plan.deletedTasks).toEqual([])
    expect(plan.deletedEntries).toEqual([])
    expect(plan.detachedTasks).toEqual(sub.taskIds)
  })

  it('entries only — time trashed, tasks kept standalone', () => {
    const plan = planProjectCascade(PROJECT, sub, projectFlags(false, true))
    expect(plan.deletedTasks).toEqual([])
    expect(plan.deletedEntries).toEqual(sub.endedEntryIds)
    expect(plan.detachedTasks).toEqual(sub.taskIds)
  })

  it('tasks only — tasks trashed, their time kept and detached', () => {
    const plan = planProjectCascade(PROJECT, sub, projectFlags(true, false))
    expect(plan.deletedTasks).toEqual(sub.taskIds)
    expect(plan.deletedEntries).toEqual([])
    expect(plan.detachedTasks).toEqual([])
  })

  it('tasks + entries — the whole subtree goes', () => {
    const plan = planProjectCascade(PROJECT, sub, projectFlags(true, true))
    expect(plan.deletedTasks).toEqual(sub.taskIds)
    expect(plan.deletedEntries).toEqual(sub.endedEntryIds)
    expect(plan.detachedTasks).toEqual([])
  })

  it('never plans a project delete — the project itself is deleted by the caller', () => {
    for (const flags of [
      projectFlags(false, false),
      projectFlags(false, true),
      projectFlags(true, false),
      projectFlags(true, true)
    ]) {
      const plan = planProjectCascade(PROJECT, sub, flags)
      expect(plan.deletedProjects).toEqual([])
      expect(plan.detachedProjects).toEqual([])
      // Entries pointing at the project always detach; at a task, only if it was trashed.
      expect(plan.clearedRefs).toEqual({
        clientIds: [],
        projectIds: [PROJECT],
        taskIds: plan.deletedTasks
      })
    }
  })
})
