/** Form validation and user-facing messages for Supabase Auth (email + password). */

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function validateEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) ? null : 'Enter a valid email address.';
}

export function validatePassword(password: string) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Mix letters and numbers.';
  return null;
}

export function validateCode(code: string) {
  return /^\d{6,10}$/.test(code.trim()) ? null : 'Enter the code from the email.';
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'That email and password don’t match.',
  email_exists: 'That email already has an account. Sign in instead.',
  user_already_exists: 'That email already has an account. Sign in instead.',
  weak_password: 'Pick a stronger password.',
  same_password: 'Pick a password you haven’t used here before.',
  email_address_invalid: 'Enter a valid email address.',
  otp_expired: 'That code is wrong or expired. Request a new one.',
  over_email_send_rate_limit: 'Too many emails. Wait a minute and try again.',
  over_request_rate_limit: 'Too many tries. Wait a minute and try again.',
  anonymous_provider_disabled: 'Cloud backup isn’t switched on for this app yet.',
  email_provider_disabled: 'Email sign-in isn’t switched on for this app yet.',
  signup_disabled: 'New sign-ups are paused right now.',
};

/** Turns a Supabase error (or a network failure) into one short sentence. */
export function authMessage(error: unknown) {
  const e = error as { code?: string; status?: number; name?: string; message?: string };
  if (e?.code && MESSAGES[e.code]) return MESSAGES[e.code];
  if (e?.status === 0 || e?.name === 'AuthRetryableFetchError' || /network/i.test(e?.message ?? ''))
    return 'You’re offline. Check your connection and try again.';
  return e?.message || 'Something went wrong. Try again.';
}
