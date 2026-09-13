// Rule 2 — rate inheritance, plus the Rule 1 chain walk that feeds it.
// Pure: `pickRate`, `walkChain` and `resolveEntryRate` all take a preloaded
// RateContext, so nothing here touches a database.
// (`loadRateContext` and `resolveRate` are the DB-welded pair — they are just
// the four SELECTs plus a call into the functions tested below, so they are
// covered indirectly by the cascade/DB spec rather than mocked here.)
import { describe, expect, it } from 'vitest'
import { pickRate, resolveEntryRate, walkChain } from '../../server/utils/rates'
import {
  makeClient,
  makeEntry,
  makeProject,
  makeRateContext,
  makeTask
} from '../helpers/factories'

describe('pickRate — first non-null wins', () => {
  const full = {
    rateOverride: 200,
    taskRate: 150,
    projectRate: 95,
    clientRate: 110,
    memberRate: 90,
    defaultRate: 85
  }

  it('picks the entry override ahead of everything below it', () => {
    expect(pickRate(full)).toEqual({ rate: 200, source: 'override' })
  })

  it('falls to the task rate when there is no override', () => {
    expect(pickRate({ ...full, rateOverride: null })).toEqual({ rate: 150, source: 'task' })
  })

  it('falls to the project rate when override and task are null', () => {
    expect(pickRate({ ...full, rateOverride: null, taskRate: null })).toEqual({
      rate: 95,
      source: 'project'
    })
  })

  it('falls to the client rate when override, task and project are null', () => {
    expect(
      pickRate({ ...full, rateOverride: null, taskRate: null, projectRate: null })
    ).toEqual({ rate: 110, source: 'client' })
  })

  it('falls to the org member rate when override, task, project and client are null', () => {
    expect(
      pickRate({ ...full, rateOverride: null, taskRate: null, projectRate: null, clientRate: null })
    ).toEqual({ rate: 90, source: 'member' })
  })

  it('falls to the user default when only it is set', () => {
    expect(pickRate({ defaultRate: 85 })).toEqual({ rate: 85, source: 'user' })
  })

  it('reports "none" when every rung is null', () => {
    expect(
      pickRate({
        rateOverride: null,
        taskRate: null,
        projectRate: null,
        clientRate: null,
        memberRate: null,
        defaultRate: null
      })
    ).toEqual({ rate: null, source: 'none' })
  })

  it('reports "none" for an empty options object (every rung undefined)', () => {
    expect(pickRate({})).toEqual({ rate: null, source: 'none' })
  })

  it('treats undefined the same as null at every rung', () => {
    expect(pickRate({ rateOverride: undefined, taskRate: undefined, projectRate: undefined, clientRate: 110 })).toEqual({
      rate: 110,
      source: 'client'
    })
  })

  it('keeps a zero rate — 0 is a real rate, not "unset"', () => {
    expect(pickRate({ projectRate: 0, clientRate: 110 })).toEqual({ rate: 0, source: 'project' })
    expect(pickRate({ rateOverride: 0, projectRate: 95 })).toEqual({ rate: 0, source: 'override' })
    expect(pickRate({ taskRate: 0, projectRate: 95 })).toEqual({ rate: 0, source: 'task' })
  })

  it('walks the whole ladder one rung at a time — override > task > project > client > member > user', () => {
    const ladder: { opts: Parameters<typeof pickRate>[0], source: string, rate: number | null }[] = [
      { opts: { rateOverride: 200 }, source: 'override', rate: 200 },
      { opts: { taskRate: 150 }, source: 'task', rate: 150 },
      { opts: { projectRate: 95 }, source: 'project', rate: 95 },
      { opts: { clientRate: 110 }, source: 'client', rate: 110 },
      { opts: { memberRate: 90 }, source: 'member', rate: 90 },
      { opts: { defaultRate: 85 }, source: 'user', rate: 85 },
      { opts: {}, source: 'none', rate: null }
    ]
    for (const rung of ladder) {
      expect(pickRate(rung.opts)).toEqual({ rate: rung.rate, source: rung.source })
    }
  })
})

describe('walkChain — Rule 1 chain resolution', () => {
  function fixture() {
    const client = makeClient({ name: 'Northwind Legal', rate: 110 })
    const project = makeProject({ name: 'Intake form', clientId: client.id, rate: 95 })
    const task = makeTask({ name: 'Validation', projectId: project.id })
    const ctx = makeRateContext({ clients: [client], projects: [project], tasks: [task] })
    return { client, project, task, ctx }
  }

  it('returns null when there is no ref at all', () => {
    const { ctx } = fixture()
    expect(walkChain(null, null, ctx)).toBeNull()
    expect(walkChain(undefined, undefined, ctx)).toBeNull()
    expect(walkChain('task', null, ctx)).toBeNull()
    expect(walkChain(null, 'task-x', ctx)).toBeNull()
  })

  it('returns null for an unknown ref type', () => {
    const { ctx, task } = fixture()
    expect(walkChain('tag', task.id, ctx)).toBeNull()
  })

  it('walks task → project → client and carries all three rates', () => {
    const { ctx, client, project, task } = fixture()
    expect(walkChain('task', task.id, ctx)).toEqual({
      taskId: task.id,
      taskName: 'Validation',
      projectId: project.id,
      projectName: 'Intake form',
      clientId: client.id,
      clientName: 'Northwind Legal',
      taskRate: null,
      projectRate: 95,
      clientRate: 110,
      billableDefault: true
    })
  })

  it('walks project → client for a direct project ref (no task fields, no task rate)', () => {
    const { ctx, client, project } = fixture()
    const chain = walkChain('project', project.id, ctx)!
    expect(chain.taskId).toBeUndefined()
    expect(chain.projectId).toBe(project.id)
    expect(chain.clientId).toBe(client.id)
    expect(chain.taskRate).toBeNull()
    expect(chain.projectRate).toBe(95)
    expect(chain.clientRate).toBe(110)
  })

  it('stops at the client for a direct client ref', () => {
    const { ctx, client } = fixture()
    expect(walkChain('client', client.id, ctx)).toEqual({
      clientId: client.id,
      clientName: 'Northwind Legal',
      taskRate: null,
      projectRate: null,
      clientRate: 110,
      billableDefault: true
    })
  })

  it('carries the task’s own rate alongside the project and client rates', () => {
    const client = makeClient({ name: 'Northwind Legal', rate: 110 })
    const project = makeProject({ name: 'Intake form', clientId: client.id, rate: 95 })
    const task = makeTask({ name: 'Validation', projectId: project.id, rate: 150 })
    const ctx = makeRateContext({ clients: [client], projects: [project], tasks: [task] })
    const chain = walkChain('task', task.id, ctx)!
    expect(chain.taskRate).toBe(150)
    expect(chain.projectRate).toBe(95)
    expect(chain.clientRate).toBe(110)
  })

  it('keeps the task’s own rate when its project is dangling (trashed)', () => {
    const task = makeTask({ name: 'Orphan with a rate', projectId: 'project-that-was-trashed', rate: 200 })
    const ctx = makeRateContext({ tasks: [task] })
    expect(walkChain('task', task.id, ctx)).toEqual({
      taskId: task.id,
      taskName: 'Orphan with a rate',
      taskRate: 200,
      projectRate: null,
      clientRate: null,
      billableDefault: true
    })
  })

  it('treats a trashed (absent) task as detached', () => {
    const { ctx } = fixture()
    expect(walkChain('task', 'task-that-was-trashed', ctx)).toBeNull()
  })

  it('treats a trashed (absent) client as detached', () => {
    const { ctx } = fixture()
    expect(walkChain('client', 'client-that-was-trashed', ctx)).toBeNull()
  })

  it('treats a dangling direct project ref as detached', () => {
    const { ctx } = fixture()
    expect(walkChain('project', 'project-that-was-trashed', ctx)).toBeNull()
  })

  it('keeps the task when its project was trashed — the chain just stops there', () => {
    const task = makeTask({ name: 'Orphan task', projectId: 'project-that-was-trashed' })
    const ctx = makeRateContext({ tasks: [task] })
    expect(walkChain('task', task.id, ctx)).toEqual({
      taskId: task.id,
      taskName: 'Orphan task',
      taskRate: null,
      projectRate: null,
      clientRate: null,
      billableDefault: true
    })
  })

  it('handles a standalone task (no project) without inventing a chain', () => {
    const task = makeTask({ projectId: null, rate: 60 })
    const ctx = makeRateContext({ tasks: [task] })
    const chain = walkChain('task', task.id, ctx)!
    expect(chain.taskId).toBe(task.id)
    expect(chain.projectId).toBeUndefined()
    expect(chain.taskRate).toBe(60)
    expect(chain.projectRate).toBeNull()
    expect(chain.clientRate).toBeNull()
  })

  it('handles a project whose client was trashed — project kept, client dropped', () => {
    const project = makeProject({ clientId: 'client-that-was-trashed', rate: 95 })
    const ctx = makeRateContext({ projects: [project] })
    const chain = walkChain('project', project.id, ctx)!
    expect(chain.projectId).toBe(project.id)
    expect(chain.projectRate).toBe(95)
    expect(chain.clientId).toBeUndefined()
    expect(chain.clientRate).toBeNull()
  })

  it('reports billableDefault from the resolved project, and true otherwise', () => {
    const project = makeProject({ billableDefault: false })
    const task = makeTask({ projectId: project.id })
    const loose = makeTask({ projectId: null })
    const ctx = makeRateContext({ projects: [project], tasks: [task, loose] })
    expect(walkChain('task', task.id, ctx)!.billableDefault).toBe(false)
    expect(walkChain('project', project.id, ctx)!.billableDefault).toBe(false)
    expect(walkChain('task', loose.id, ctx)!.billableDefault).toBe(true)
  })
})

describe('resolveEntryRate — the full ladder against a context', () => {
  const userId = 'user-mara'
  const client = makeClient({ name: 'Northwind Legal', rate: 110 })
  const project = makeProject({ name: 'Intake form', clientId: client.id, rate: 95 })
  const rateless = makeProject({ name: 'Website redesign', clientId: client.id, rate: null })
  const orphan = makeProject({ name: 'Internal', clientId: null, rate: null })
  const task = makeTask({ projectId: project.id })
  const ratelessTask = makeTask({ projectId: rateless.id })
  const orphanTask = makeTask({ projectId: orphan.id })
  /** Has its own rate AND sits under a rated project — the task rung must win. */
  const ratedTask = makeTask({ name: 'Design pass', projectId: project.id, rate: 150 })
  /** Standalone (no project) with its own rate. */
  const standaloneRatedTask = makeTask({ name: 'Consulting call', projectId: null, rate: 60 })

  const ctx = makeRateContext({
    clients: [client],
    projects: [project, rateless, orphan],
    tasks: [task, ratelessTask, orphanTask, ratedTask, standaloneRatedTask],
    userRates: { [userId]: { memberRate: 90, defaultRate: 85 } }
  })

  it('override beats the project rate', () => {
    expect(
      resolveEntryRate(makeEntry({ userId, refType: 'task', refId: task.id, rateOverride: 200 }), ctx)
    ).toEqual({ rate: 200, source: 'override' })
  })

  it('project rate wins through a task ref with no rate of its own', () => {
    expect(resolveEntryRate(makeEntry({ userId, refType: 'task', refId: task.id }), ctx)).toEqual({
      rate: 95,
      source: 'project'
    })
  })

  it('a task’s own rate wins over its project’s rate', () => {
    expect(resolveEntryRate(makeEntry({ userId, refType: 'task', refId: ratedTask.id }), ctx)).toEqual({
      rate: 150,
      source: 'task'
    })
  })

  it('a standalone task’s own rate resolves with no project/client chain at all', () => {
    expect(
      resolveEntryRate(makeEntry({ userId, refType: 'task', refId: standaloneRatedTask.id }), ctx)
    ).toEqual({ rate: 60, source: 'task' })
  })

  it('entry override still beats a task rate', () => {
    expect(
      resolveEntryRate(
        makeEntry({ userId, refType: 'task', refId: ratedTask.id, rateOverride: 300 }),
        ctx
      )
    ).toEqual({ rate: 300, source: 'override' })
  })

  it('client rate wins when the project has none', () => {
    expect(
      resolveEntryRate(makeEntry({ userId, refType: 'task', refId: ratelessTask.id }), ctx)
    ).toEqual({ rate: 110, source: 'client' })
  })

  it('member rate wins when neither project nor client has one', () => {
    expect(
      resolveEntryRate(makeEntry({ userId, refType: 'task', refId: orphanTask.id }), ctx)
    ).toEqual({ rate: 90, source: 'member' })
  })

  it('user default wins for a detached entry with no member rate', () => {
    const soloCtx = makeRateContext({
      userRates: { [userId]: { memberRate: null, defaultRate: 85 } }
    })
    expect(resolveEntryRate(makeEntry({ userId }), soloCtx)).toEqual({ rate: 85, source: 'user' })
  })

  it('reports none when the user has no member rate and no default', () => {
    const bareCtx = makeRateContext({
      userRates: { [userId]: { memberRate: null, defaultRate: null } }
    })
    expect(resolveEntryRate(makeEntry({ userId }), bareCtx)).toEqual({ rate: null, source: 'none' })
  })

  it('reports none when the user is not in the context at all', () => {
    expect(resolveEntryRate(makeEntry({ userId: 'stranger' }), ctx)).toEqual({
      rate: null,
      source: 'none'
    })
  })

  it('falls back to the member/user rungs when the ref dangles', () => {
    expect(
      resolveEntryRate(makeEntry({ userId, refType: 'project', refId: 'gone' }), ctx)
    ).toEqual({ rate: 90, source: 'member' })
  })
})

describe('rate source reporting — the Projects page subline (Rule 2)', () => {
  // ProjectCard.vue turns `resolvedRate` + `rateSource` into the card subline:
  //   'no rate' | '$95/h' | '$110/h from client' | '$85/h default'
  // buildProjectDtos() calls pickRate() WITHOUT an override (projects have no
  // entry-level override), so the sources it can produce are exactly these.
  function projectSubline(p: { resolvedRate: number | null, rateSource: string }): string {
    if (p.resolvedRate == null || p.rateSource === 'none') return 'no rate'
    const base = `$${p.resolvedRate}/h`
    if (p.rateSource === 'project') return base
    if (p.rateSource === 'client') return `${base} from client`
    return `${base} default`
  }

  const userRates = { mara: { memberRate: 90, defaultRate: 85 } }

  function sourceFor(project: ReturnType<typeof makeProject>, clients: ReturnType<typeof makeClient>[]) {
    const ctx = makeRateContext({ clients, projects: [project], userRates })
    const client = project.clientId ? ctx.clients.get(project.clientId) : undefined
    return pickRate({
      projectRate: project.rate,
      clientRate: client?.rate,
      memberRate: userRates.mara.memberRate,
      defaultRate: userRates.mara.defaultRate
    })
  }

  it('own rate → source "project"', () => {
    const client = makeClient({ rate: 110 })
    const p = makeProject({ clientId: client.id, rate: 95 })
    const r = sourceFor(p, [client])
    expect(r).toEqual({ rate: 95, source: 'project' })
    expect(projectSubline({ resolvedRate: r.rate, rateSource: r.source })).toBe('$95/h')
  })

  it('inherited from its client → source "client"', () => {
    const client = makeClient({ rate: 110 })
    const p = makeProject({ clientId: client.id, rate: null })
    const r = sourceFor(p, [client])
    expect(r).toEqual({ rate: 110, source: 'client' })
    expect(projectSubline({ resolvedRate: r.rate, rateSource: r.source })).toBe('$110/h from client')
  })

  it('member rate → source "member", worded as a default', () => {
    const p = makeProject({ clientId: null, rate: null })
    const r = sourceFor(p, [])
    expect(r).toEqual({ rate: 90, source: 'member' })
    expect(projectSubline({ resolvedRate: r.rate, rateSource: r.source })).toBe('$90/h default')
  })

  it('user default → source "user", worded as a default', () => {
    const p = makeProject({ clientId: null, rate: null })
    const ctx = makeRateContext({ projects: [p] })
    expect(ctx.clients.size).toBe(0)
    const r = pickRate({ projectRate: p.rate, memberRate: null, defaultRate: 85 })
    expect(r).toEqual({ rate: 85, source: 'user' })
    expect(projectSubline({ resolvedRate: r.rate, rateSource: r.source })).toBe('$85/h default')
  })

  it('nothing anywhere → source "none", worded "no rate"', () => {
    const p = makeProject({ clientId: null, rate: null })
    const r = pickRate({ projectRate: p.rate, memberRate: null, defaultRate: null })
    expect(r).toEqual({ rate: null, source: 'none' })
    expect(projectSubline({ resolvedRate: r.rate, rateSource: r.source })).toBe('no rate')
  })

  it('a client with a null rate does not shadow the member rung', () => {
    const client = makeClient({ rate: null })
    const p = makeProject({ clientId: client.id, rate: null })
    expect(sourceFor(p, [client])).toEqual({ rate: 90, source: 'member' })
  })

  it('never reports "override" — projects have no entry-level override', () => {
    const client = makeClient({ rate: 110 })
    const p = makeProject({ clientId: client.id, rate: 95 })
    expect(sourceFor(p, [client]).source).not.toBe('override')
  })
})
