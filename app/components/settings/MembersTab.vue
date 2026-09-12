<script setup lang="ts">
// Settings → Members & roles: member table (role select, per-member rate
// override, remove w/ confirm — the last owner is protected server-side and
// disabled here) plus invites: POST /api/invites returns a copyable
// /register?invite=TOKEN link. No email is sent (SMTP later).
import type { InviteDto, OrgMemberDto } from '#shared/types/settings'

type Role = OrgMemberDto['role']

const session = useUserSession()
const toast = useToast()

const me = computed(() => session.user.value as SessionUser | null)
const canManage = computed(() => me.value?.role === 'owner' || me.value?.role === 'admin')

const members = ref<OrgMemberDto[]>([])
const invites = ref<InviteDto[]>([])
const loading = ref(true)

/** Per-member rate override drafts, keyed by userId. */
const rateDrafts = ref<Record<string, string>>({})

const roleItems = [
  { label: 'Owner', value: 'owner' },
  { label: 'Admin', value: 'admin' },
  { label: 'Member', value: 'member' }
]

const ownerCount = computed(() => members.value.filter(m => m.role === 'owner').length)

async function load() {
  loading.value = true
  try {
    members.value = await $fetch<OrgMemberDto[]>('/api/org/members')
    rateDrafts.value = Object.fromEntries(
      members.value.map(m => [m.userId, m.rate != null ? String(m.rate) : ''])
    )
    if (canManage.value) invites.value = await $fetch<InviteDto[]>('/api/invites')
  } catch (err) {
    toast.add({ title: apiError(err), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    loading.value = false
  }
}
onMounted(load)

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

/** The last owner can't be demoted or removed (server enforces too). */
function isLastOwner(m: OrgMemberDto) {
  return m.role === 'owner' && ownerCount.value <= 1
}

// ── Role + rate updates ────────────────────────────────────────────────────
async function changeRole(m: OrgMemberDto, role: Role) {
  if (role === m.role) return
  try {
    const updated = await $fetch<OrgMemberDto>(`/api/org/members/${m.userId}`, {
      method: 'PATCH',
      body: { role }
    })
    Object.assign(m, updated)
    if (m.userId === me.value?.id) await session.fetch()
    toast.add({ title: `${m.name} is now ${role}`, icon: 'i-lucide-user-check', color: 'primary' })
  } catch (err) {
    toast.add({ title: apiError(err), icon: 'i-lucide-circle-alert', color: 'error' })
    await load()
  }
}

async function saveRate(m: OrgMemberDto) {
  const raw = (rateDrafts.value[m.userId] ?? '').trim().replace(/^\$/, '')
  const rate = raw === '' ? null : Number(raw)
  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
    rateDrafts.value[m.userId] = m.rate != null ? String(m.rate) : ''
    return
  }
  if (rate === m.rate) return
  try {
    const updated = await $fetch<OrgMemberDto>(`/api/org/members/${m.userId}`, {
      method: 'PATCH',
      body: { rate }
    })
    Object.assign(m, updated)
    toast.add({
      title: rate != null ? `Rate override set to $${rate}/h` : 'Rate override cleared',
      icon: 'i-lucide-check',
      color: 'primary'
    })
  } catch (err) {
    toast.add({ title: apiError(err), icon: 'i-lucide-circle-alert', color: 'error' })
    rateDrafts.value[m.userId] = m.rate != null ? String(m.rate) : ''
  }
}

// ── Remove member ──────────────────────────────────────────────────────────
const removeTarget = ref<OrgMemberDto | null>(null)
const removing = ref(false)

async function confirmRemove() {
  const target = removeTarget.value
  if (!target || removing.value) return
  removing.value = true
  try {
    await $fetch(`/api/org/members/${target.userId}`, { method: 'DELETE' })
    members.value = members.value.filter(m => m.userId !== target.userId)
    removeTarget.value = null
    toast.add({ title: `${target.name} removed`, icon: 'i-lucide-user-minus', color: 'neutral' })
  } catch (err) {
    toast.add({ title: apiError(err), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    removing.value = false
  }
}

// ── Invites ────────────────────────────────────────────────────────────────
const inviteOpen = ref(false)
const inviteEmail = ref('')
const inviteRole = ref<Role>('member')
const inviteBusy = ref(false)
const inviteError = ref<string | null>(null)
const createdInvite = ref<InviteDto | null>(null)

const canInvite = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.value.trim()))

function openInvite() {
  inviteEmail.value = ''
  inviteRole.value = 'member'
  inviteError.value = null
  createdInvite.value = null
  inviteOpen.value = true
}

async function createInvite() {
  if (!canInvite.value || inviteBusy.value) return
  inviteBusy.value = true
  inviteError.value = null
  try {
    const invite = await $fetch<InviteDto>('/api/invites', {
      method: 'POST',
      body: { email: inviteEmail.value.trim(), role: inviteRole.value }
    })
    createdInvite.value = invite
    invites.value = [invite, ...invites.value]
  } catch (err) {
    inviteError.value = apiError(err)
  } finally {
    inviteBusy.value = false
  }
}

const requestURL = useRequestURL()
function inviteLink(token: string) {
  return `${requestURL.origin}/register?invite=${token}`
}

async function copyLink(token: string) {
  try {
    await navigator.clipboard.writeText(inviteLink(token))
    toast.add({ title: 'Invite link copied', icon: 'i-lucide-clipboard-check', color: 'primary' })
  } catch {
    toast.add({ title: "Couldn't copy to clipboard", icon: 'i-lucide-clipboard-x', color: 'error' })
  }
}

async function revokeInvite(invite: InviteDto) {
  try {
    await $fetch(`/api/invites/${invite.id}`, { method: 'DELETE' })
    invites.value = invites.value.filter(i => i.id !== invite.id)
    toast.add({ title: `Invite for ${invite.email} revoked`, icon: 'i-lucide-mail-x', color: 'neutral' })
  } catch (err) {
    toast.add({ title: apiError(err), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

function expiresLabel(iso: string) {
  const days = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
  return days <= 1 ? 'expires today' : `expires in ${days}d`
}

function apiError(err: unknown): string {
  const e = err as { data?: { message?: string } }
  return e.data?.message ?? 'Something went wrong. Try again.'
}
</script>

<template>
  <div class="flex flex-col gap-[22px]">
    <!-- Members table -->
    <div class="overflow-hidden rounded-lg border border-default bg-elevated shadow-sm">
      <div class="flex items-center gap-[11px] border-b border-default px-[22px] py-3">
        <div class="min-w-0 flex-1">
          <h3 class="text-[15px] font-medium text-highlighted">Members</h3>
          <p class="text-xs text-muted">
            Roles gate settings; the rate override beats a member's own default (Rule 2).
          </p>
        </div>
        <UButton
          v-if="canManage"
          color="primary"
          variant="outline"
          icon="i-lucide-user-plus"
          label="Invite member"
          @click="openInvite"
        />
      </div>

      <div
        class="grid grid-cols-[minmax(0,1.6fr)_140px_150px_70px] items-center gap-[11px] border-b border-default px-[22px] py-2 text-[10px] tracking-[0.08em] text-muted uppercase"
      >
        <span>Member</span>
        <span>Role</span>
        <span>Rate override</span>
        <span />
      </div>

      <div
        v-for="m in members"
        :key="m.userId"
        class="grid grid-cols-[minmax(0,1.6fr)_140px_150px_70px] items-center gap-[11px] border-b border-default px-[22px] py-[11px] last:border-0"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <span
            class="grid size-[28px] shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {{ initials(m.name) }}
          </span>
          <div class="min-w-0">
            <div class="truncate text-sm font-medium text-highlighted">
              {{ m.name }}
              <span v-if="m.userId === me?.id" class="text-xs font-normal text-dimmed">(you)</span>
            </div>
            <div class="truncate text-xs text-muted">{{ m.email }}</div>
          </div>
        </div>

        <USelectMenu
          :model-value="m.role"
          :items="roleItems"
          value-key="value"
          :search-input="false"
          size="sm"
          :disabled="!canManage || isLastOwner(m)"
          :title="isLastOwner(m) ? 'An organization needs at least one owner.' : undefined"
          @update:model-value="(v: unknown) => changeRole(m, v as Role)"
        />

        <UInput
          v-model="rateDrafts[m.userId]"
          inputmode="decimal"
          size="sm"
          :disabled="!canManage"
          :placeholder="m.defaultRate != null ? `$${m.defaultRate}/h default` : 'None'"
          class="tnum"
          @blur="saveRate(m)"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        >
          <template #leading>
            <span class="text-xs text-dimmed">$</span>
          </template>
          <template #trailing>
            <span class="text-xs text-dimmed">/h</span>
          </template>
        </UInput>

        <div class="flex justify-end">
          <UButton
            v-if="canManage"
            icon="i-lucide-user-minus"
            color="neutral"
            variant="ghost"
            square
            title="Remove from organization"
            aria-label="Remove member"
            class="size-[30px] justify-center text-dimmed hover:text-primary"
            :disabled="isLastOwner(m)"
            @click="removeTarget = m"
          />
        </div>
      </div>

      <p v-if="!loading && !members.length" class="px-[22px] py-8 text-center text-[13px] text-muted">
        No members found.
      </p>
    </div>

    <!-- Pending invites -->
    <div v-if="canManage && invites.length" class="overflow-hidden rounded-lg border border-default bg-elevated shadow-sm">
      <div class="border-b border-default px-[22px] py-3">
        <h3 class="text-[15px] font-medium text-highlighted">Pending invites</h3>
        <p class="text-xs text-muted">Share the link yourself — email delivery coming later.</p>
      </div>
      <div
        v-for="i in invites"
        :key="i.id"
        class="flex items-center gap-[11px] border-b border-default px-[22px] py-[11px] last:border-0"
      >
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium text-highlighted">{{ i.email }}</div>
          <div class="text-xs text-muted">
            <span class="capitalize">{{ i.role }}</span> · {{ expiresLabel(i.expiresAt) }}
          </div>
        </div>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-link"
          label="Copy link"
          @click="copyLink(i.token)"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          square
          size="sm"
          title="Revoke invite"
          aria-label="Revoke invite"
          class="text-dimmed hover:text-primary"
          @click="revokeInvite(i)"
        />
      </div>
    </div>

    <!-- Invite modal -->
    <UModal v-model:open="inviteOpen" title="Invite member" :ui="{ content: 'max-w-[440px]' }">
      <template #body>
        <div v-if="!createdInvite" class="flex flex-col gap-4">
          <UFormField label="Email">
            <UInput
              v-model="inviteEmail"
              type="email"
              autofocus
              placeholder="teammate@example.com"
              class="w-full"
              @keydown.enter="createInvite"
            />
          </UFormField>
          <UFormField label="Role">
            <USelectMenu
              v-model="inviteRole"
              :items="roleItems"
              value-key="value"
              :search-input="false"
              class="w-full"
            />
          </UFormField>
          <UAlert
            v-if="inviteError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="inviteError"
          />
        </div>

        <div v-else class="flex flex-col gap-3">
          <p class="text-sm text-default">
            Invite created for <span class="font-medium text-highlighted">{{ createdInvite.email }}</span>
            as <span class="capitalize">{{ createdInvite.role }}</span>.
          </p>
          <div class="flex items-center gap-2">
            <UInput
              :model-value="inviteLink(createdInvite.token)"
              readonly
              class="tnum flex-1"
              :ui="{ base: 'text-xs' }"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <UButton
              color="primary"
              variant="outline"
              icon="i-lucide-clipboard-copy"
              label="Copy"
              @click="copyLink(createdInvite.token)"
            />
          </div>
          <p class="text-xs text-muted">
            Share this link — email delivery coming later. It expires in 7 days and works once.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="ml-auto flex items-center gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :label="createdInvite ? 'Done' : 'Cancel'"
            @click="inviteOpen = false"
          />
          <UButton
            v-if="!createdInvite"
            color="primary"
            variant="outline"
            label="Create invite"
            :disabled="!canInvite"
            :loading="inviteBusy"
            @click="createInvite"
          />
        </div>
      </template>
    </UModal>

    <!-- Remove confirm -->
    <UModal
      :open="removeTarget != null"
      title="Remove member?"
      :ui="{ content: 'max-w-[420px]' }"
      @update:open="(v: boolean) => { if (!v) removeTarget = null }"
    >
      <template #body>
        <p class="text-sm text-default">
          Remove <span class="font-medium text-highlighted">{{ removeTarget?.name }}</span>
          ({{ removeTarget?.email }}) from the organization? Their tracked time stays; they just
          lose access.
        </p>
      </template>
      <template #footer>
        <div class="ml-auto flex items-center gap-2">
          <UButton color="neutral" variant="outline" label="Cancel" @click="removeTarget = null" />
          <UButton
            color="primary"
            variant="outline"
            label="Remove"
            :loading="removing"
            @click="confirmRemove"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
