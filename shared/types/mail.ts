// Mail-swing DTOs (invite emails + password reset).
// shared/types/index.ts is frozen — new types live here.
import type { InviteDto } from './settings'

/** POST /api/invites response: the invite plus whether an email went out. */
export interface InviteCreateDto extends InviteDto {
  emailSent: boolean
}

/** POST /api/auth/forgot — always this generic shape (no account enumeration). */
export interface ForgotResponseDto {
  ok: true
}

/** POST /api/auth/reset success. */
export interface ResetResponseDto {
  ok: true
}
