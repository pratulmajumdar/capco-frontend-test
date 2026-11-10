export interface AccountAccessSearch {
  returnTo?: string
}

/** Restricts post-authentication navigation to local applicant journey paths. */
export function parseAccountAccessSearch(
  search: Record<string, unknown>,
): AccountAccessSearch {
  const returnTo = search.returnTo
  return typeof returnTo === 'string' && isSafeJourneyPath(returnTo)
    ? { returnTo }
    : {}
}

export function isSafeJourneyPath(path: string): boolean {
  return path.startsWith('/applications/') && !path.startsWith('//')
}

export function accountAccessHref(
  path: '/sign-in' | '/create-account',
  returnTo?: string,
): string {
  return returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path
}

export function readCsrfToken(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  const sessionValue = window.sessionStorage.getItem('kyc-csrf-token')
  if (sessionValue) {
    return sessionValue
  }

  const cookieValue = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('XSRF-TOKEN='))

  if (!cookieValue) {
    return ''
  }

  return decodeURIComponent(cookieValue.slice('XSRF-TOKEN='.length))
}

export function storeCsrfToken(token?: string | null): void {
  if (typeof window === 'undefined' || !token) {
    return
  }

  window.sessionStorage.setItem('kyc-csrf-token', token)
}
