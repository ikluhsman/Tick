// README Rule 3, the decision half: given the live subtree under the object
// being deleted and the dialog's checkboxes, which rows go to trash and which
// are kept and detached. Pure — no database, no Nitro — so the table can be
// read (and tested) on its own; server/utils/cascade.ts collects the subtree,
// applies this plan as SQL, and snapshots what it cleared for undo.

/** Live ids under the object being deleted, collected by cascade.ts. */
export interface Subtree {
  projectIds: string[]
  taskIds: string[]
  /** Ended, non-trashed entries resolving into the subtree (all org users). */
  endedEntryIds: string[]
}

export interface ClientCascadeFlags {
  cascadeProjects: boolean
  cascadeTasks: boolean
  cascadeEntries: boolean
}

export interface ProjectCascadeFlags {
  cascadeTasks: boolean
  cascadeEntries: boolean
}

export interface CascadePlan {
  /** Soft-deleted: deleted_at = now, recoverable from trash for 30 days. */
  deletedProjects: string[]
  deletedTasks: string[]
  deletedEntries: string[]
  /** Kept, but they lose client_id — the client above them is going away. */
  detachedProjects: string[]
  /** Kept, but they lose project_id — the project above them was deleted. */
  detachedTasks: string[]
  /**
   * Ids whose rows are now trashed: any surviving entry pointing DIRECTLY at
   * one of them has its ref cleared rather than following it into the trash,
   * so time is never lost silently (the running timer included).
   */
  clearedRefs: { clientIds: string[], projectIds: string[], taskIds: string[] }
}

export function planClientCascade(
  clientId: string,
  sub: Subtree,
  flags: ClientCascadeFlags
): CascadePlan {
  const deletedProjects = flags.cascadeProjects ? sub.projectIds : []
  const deletedTasks = flags.cascadeTasks ? sub.taskIds : []
  return {
    deletedProjects,
    deletedTasks,
    deletedEntries: flags.cascadeEntries ? sub.endedEntryIds : [],
    // A kept project outlives its client, so it becomes client-less (and its
    // rate falls back a level, Rule 2).
    detachedProjects: flags.cascadeProjects ? [] : sub.projectIds,
    // A kept task only goes standalone when the project above it is deleted —
    // with the projects kept too, the task keeps its project.
    detachedTasks: flags.cascadeProjects && !flags.cascadeTasks ? sub.taskIds : [],
    // The client itself always goes, so entries pointing at it always detach.
    clearedRefs: { clientIds: [clientId], projectIds: deletedProjects, taskIds: deletedTasks }
  }
}

export function planProjectCascade(
  projectId: string,
  sub: Subtree,
  flags: ProjectCascadeFlags
): CascadePlan {
  const deletedTasks = flags.cascadeTasks ? sub.taskIds : []
  return {
    deletedProjects: [],
    deletedTasks,
    deletedEntries: flags.cascadeEntries ? sub.endedEntryIds : [],
    detachedProjects: [],
    // The project itself always goes, so a kept task is always left standalone.
    detachedTasks: flags.cascadeTasks ? [] : sub.taskIds,
    clearedRefs: { clientIds: [], projectIds: [projectId], taskIds: deletedTasks }
  }
}
