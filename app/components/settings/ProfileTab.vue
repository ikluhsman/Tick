<script setup lang="ts">
// Settings → Profile: name / email / default rate → PATCH /api/me/profile
// (409 on duplicate email), plus password change → PATCH /api/me/password
// (generic 403 on a wrong current password).

const session = useUserSession()
const toast = useToast()
const ui = useUiStore()

const me = computed(() => session.user.value as SessionUser | null)

// ── Undo window (Rule 4: default 8s, 3–30s) ────────────────────────────────
// localStorage-backed preference on the ui store; every undo toast reads it.
onMounted(() => ui.hydratePrefs())

const undoDraft = ref(ui.undoSeconds)
watch(() => ui.undoSeconds, v => (undoDraft.value = v))

function commitUndo(v: number | undefined) {
  if (v == null || !Number.isFinite(v)) {
    undoDraft.value = ui.undoSeconds
    return
  }
  ui.setUndoSeconds(v)
  undoDraft.value = ui.undoSeconds
}

// ── Profile form ───────────────────────────────────────────────────────────
const name = ref(me.value?.name ?? '')
const email = ref(me.value?.email ?? '')
const rateRaw = ref(me.value?.defaultRate != null ? String(me.value.defaultRate) : '')
const savingProfile = ref(false)
const profileError = ref<string | null>(null)

/** null = empty (clear the rate), undefined = invalid */
const rateNum = computed<number | null | undefined>(() => {
  const t = rateRaw.value.trim().replace(/^\$/, '').replace(/\/h$/, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
})

const profileDirty = computed(() => {
  if (!me.value) return false
  return (
    name.value.trim() !== me.value.name
    || email.value.trim().toLowerCase() !== me.value.email
    || rateNum.value !== me.value.defaultRate
  )
})

const canSaveProfile = computed(() =>
  profileDirty.value
  && name.value.trim().length > 0
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())
  && rateNum.value !== undefined
)

async function saveProfile() {
  if (!canSaveProfile.value || savingProfile.value) return
  savingProfile.value = true
  profileError.value = null
  try {
    await $fetch('/api/me/profile', {
      method: 'PATCH',
      body: {
        name: name.value.trim(),
        email: email.value.trim().toLowerCase(),
        defaultRate: rateNum.value
      }
    })
    await session.fetch()
    toast.add({ title: 'Profile saved', icon: 'i-lucide-check', color: 'primary' })
  } catch (err) {
    profileError.value = apiError(err)
  } finally {
    savingProfile.value = false
  }
}

// ── Password form ──────────────────────────────────────────────────────────
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const savingPassword = ref(false)
const passwordError = ref<string | null>(null)

const confirmMismatch = computed(
  () => confirmPassword.value.length > 0 && confirmPassword.value !== newPassword.value
)

const canSavePassword = computed(() =>
  currentPassword.value.length > 0
  && newPassword.value.length >= 8
  && confirmPassword.value === newPassword.value
)

async function savePassword() {
  if (!canSavePassword.value || savingPassword.value) return
  savingPassword.value = true
  passwordError.value = null
  try {
    await $fetch('/api/me/password', {
      method: 'PATCH',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value }
    })
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    toast.add({ title: 'Password changed', icon: 'i-lucide-lock', color: 'primary' })
  } catch (err) {
    passwordError.value = apiError(err)
  } finally {
    savingPassword.value = false
  }
}

function apiError(err: unknown): string {
  const e = err as { data?: { message?: string } }
  return e.data?.message ?? 'Something went wrong. Try again.'
}
</script>

<template>
  <div class="grid grid-cols-1 items-start gap-[22px] lg:grid-cols-2">
    <!-- Profile card -->
    <section class="flex flex-col gap-4 rounded-lg border border-default bg-elevated p-[22px] shadow-sm">
      <div>
        <h2 class="text-[15px] font-medium text-highlighted">Profile</h2>
        <p class="text-xs text-muted">Your name, sign-in email and default hourly rate.</p>
      </div>

      <UFormField label="Name">
        <UInput v-model="name" placeholder="Your name" class="w-full" @keydown.enter="saveProfile" />
      </UFormField>

      <UFormField label="Email">
        <UInput v-model="email" type="email" placeholder="you@example.com" class="w-full" @keydown.enter="saveProfile" />
      </UFormField>

      <UFormField
        label="Default rate"
        help="Last fallback when nothing else sets a rate: entry override → project → client → member → this."
        :error="rateNum === undefined ? `Couldn't read “${rateRaw}” as a rate.` : undefined"
      >
        <UInput v-model="rateRaw" inputmode="decimal" placeholder="85" class="w-full tnum">
          <template #leading>
            <span class="text-sm text-muted">$</span>
          </template>
          <template #trailing>
            <span class="text-sm text-muted">/h</span>
          </template>
        </UInput>
      </UFormField>

      <UAlert
        v-if="profileError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="profileError"
      />

      <div class="flex justify-end">
        <UButton
          color="primary"
          variant="outline"
          label="Save profile"
          :disabled="!canSaveProfile"
          :loading="savingProfile"
          @click="saveProfile"
        />
      </div>
    </section>

    <!-- Preferences card -->
    <section class="flex flex-col gap-4 rounded-lg border border-default bg-elevated p-[22px] shadow-sm">
      <div>
        <h2 class="text-[15px] font-medium text-highlighted">Preferences</h2>
        <p class="text-xs text-muted">Stored in this browser.</p>
      </div>

      <UFormField
        label="Undo window"
        help="How long a delete stays undoable in the toast — 3 to 30 seconds."
      >
        <div class="flex items-center gap-4">
          <USlider
            :model-value="undoDraft"
            :min="3"
            :max="30"
            :step="1"
            class="min-w-0 flex-1"
            aria-label="Undo window in seconds"
            @update:model-value="(v: number | number[] | undefined) => commitUndo(Array.isArray(v) ? v[0] : v)"
          />
          <UInputNumber
            :model-value="undoDraft"
            :min="3"
            :max="30"
            :step="1"
            class="w-[110px]"
            :ui="{ base: 'tnum' }"
            aria-label="Undo window in seconds"
            @update:model-value="(v: number) => commitUndo(v)"
          />
          <span class="w-6 text-xs text-muted">sec</span>
        </div>
      </UFormField>
    </section>

    <!-- Password card -->
    <section class="flex flex-col gap-4 rounded-lg border border-default bg-elevated p-[22px] shadow-sm">
      <div>
        <h2 class="text-[15px] font-medium text-highlighted">Password</h2>
        <p class="text-xs text-muted">Changing your password signs no one out — sessions stay valid.</p>
      </div>

      <UFormField label="Current password">
        <UInput v-model="currentPassword" type="password" autocomplete="current-password" class="w-full" />
      </UFormField>

      <UFormField
        label="New password"
        :error="newPassword.length > 0 && newPassword.length < 8 ? 'At least 8 characters.' : undefined"
      >
        <UInput v-model="newPassword" type="password" autocomplete="new-password" placeholder="At least 8 characters" class="w-full" />
      </UFormField>

      <UFormField
        label="Confirm new password"
        :error="confirmMismatch ? 'Passwords don\'t match.' : undefined"
      >
        <UInput
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          class="w-full"
          @keydown.enter="savePassword"
        />
      </UFormField>

      <UAlert
        v-if="passwordError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="passwordError"
      />

      <div class="flex justify-end">
        <UButton
          color="primary"
          variant="outline"
          label="Change password"
          :disabled="!canSavePassword"
          :loading="savingPassword"
          @click="savePassword"
        />
      </div>
    </section>
  </div>
</template>
