import {
  Alert,
  Button,
  Card,
  CardContent,
  Link,
  Stack,
  TextField,
  Typography,
} from '@kyc/ui'
import { useEffect, useRef, useState } from 'react'

import {
  accountAccessHref,
  isSafeJourneyPath,
  storeCsrfToken,
} from './-return-target'
import styles from './account-access.module.css'

export interface SignInFormProps {
  onNavigate?: (href: string) => void
  returnTo?: string
  onSuccess: (href: string) => void
}

function parseErrorMessages(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || !('errors' in payload)) {
    return []
  }

  const errors = payload.errors
  if (!Array.isArray(errors)) {
    return []
  }

  return errors
    .filter((entry) => entry && typeof entry === 'object' && 'detail' in entry)
    .map((entry) => {
      const value = entry as { detail?: unknown }
      return typeof value.detail === 'string' ? value.detail : ''
    })
    .filter((detail) => detail.length > 0)
}

export function SignInForm({
  onNavigate,
  returnTo,
  onSuccess,
}: SignInFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [emailError, setEmailError] = useState<string>()
  const [passwordError, setPasswordError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (emailError) {
      emailInput.current?.focus()
    } else if (passwordError) {
      passwordInput.current?.focus()
    }
  }, [emailError, passwordError])

  function validateClientFields(): boolean {
    const nextEmailError =
      email.trim().length === 0 ? 'Enter an email address.' : undefined
    const nextPasswordError =
      password.length === 0 ? 'Enter your password.' : undefined

    setEmailError(nextEmailError)
    setPasswordError(nextPasswordError)

    return !(nextEmailError || nextPasswordError)
  }

  async function submit(): Promise<void> {
    setError(undefined)
    setEmailError(undefined)
    setPasswordError(undefined)

    if (!validateClientFields() || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/v1/applicant-sessions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/vnd.api+json',
          Accept: 'application/vnd.api+json',
        },
        body: JSON.stringify({
          data: {
            type: 'applicant-sessions',
            attributes: {
              email: email.trim(),
              password,
            },
          },
        }),
      })

      if (response.ok) {
        const csrfToken = response.headers.get('X-CSRF-TOKEN')
        if (csrfToken) {
          storeCsrfToken(csrfToken)
        }

        const payload = (await response.json().catch(() => null)) as {
          data?: { attributes?: { href?: string } }
        } | null
        const href = payload?.data?.attributes?.href

        if (typeof href !== 'string' || href.length === 0) {
          throw new Error('The API did not return a valid journey URL.')
        }

        if (!isSafeJourneyPath(href)) {
          throw new Error('The destination is invalid.')
        }

        onSuccess(href)
        return
      }

      const payload = (await response.json().catch(() => null)) as unknown
      const details = parseErrorMessages(payload)
      const firstError =
        payload &&
        typeof payload === 'object' &&
        'errors' in payload &&
        Array.isArray(payload.errors)
          ? payload.errors[0]
          : null

      if (firstError && typeof firstError === 'object' && firstError !== null) {
        const maybeCode = 'code' in firstError ? firstError.code : undefined
        const maybePointer =
          'source' in firstError &&
          firstError.source &&
          typeof firstError.source === 'object' &&
          'pointer' in firstError.source
            ? firstError.source.pointer
            : undefined

        if (maybeCode === 'invalid-credentials') {
          setError('Invalid email or password.')
          return
        }

        if (maybeCode === 'rate-limited') {
          setError('Too many attempts. Please wait a moment and try again.')
          return
        }

        if (maybeCode === 'unsupported-media-type') {
          setError('Use application/vnd.api+json for JSON:API request bodies.')
          return
        }

        if (maybePointer === '/data/attributes/email') {
          setEmailError(details[0] || 'Enter a valid email address.')
          return
        }

        if (maybePointer === '/data/attributes/password') {
          setPasswordError(details[0] || 'Enter your password.')
          return
        }
      }

      if (details.length > 0) {
        setError(details[0])
        return
      }

      if (response.status === 400) {
        setError('Please check the email and password and try again.')
        return
      }

      setError('Unable to sign in right now. Please try again.')
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <CardContent className={styles.cardContent}>
          <Stack
            component="form"
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
            spacing={3}
          >
            <Stack spacing={1}>
              <Typography component="h1" variant="heading">
                Welcome back
              </Typography>
              <Typography tone="muted">
                Sign in to continue your KYC application.
              </Typography>
            </Stack>
            {(error ?? emailError ?? passwordError) ? (
              <Alert aria-live="assertive" role="alert" severity="error">
                {error ?? emailError ?? passwordError}
              </Alert>
            ) : null}
            <TextField
              autoComplete="email"
              disabled={isSubmitting}
              error={Boolean(emailError)}
              fullWidth
              helperText={emailError}
              id="applicant-email"
              inputRef={emailInput}
              label="Email address"
              name="email"
              onChange={(event) => {
                setEmail(event.target.value)
                setEmailError(undefined)
                setPasswordError(undefined)
              }}
              required
              type="email"
              value={email}
            />
            <TextField
              autoComplete="current-password"
              disabled={isSubmitting}
              error={Boolean(passwordError)}
              fullWidth
              helperText={passwordError}
              id="applicant-password"
              inputRef={passwordInput}
              label="Password"
              name="password"
              onChange={(event) => {
                setPassword(event.target.value)
                setEmailError(undefined)
                setPasswordError(undefined)
              }}
              required
              type="password"
              value={password}
            />
            <Button
              aria-busy={isSubmitting}
              className={styles.submit}
              disabled={isSubmitting}
              fullWidth
              size="large"
              type="submit"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
            <Typography
              className={styles.footer}
              align="center"
              variant="caption"
            >
              <span>New to KYC? </span>
              <Link
                href={accountAccessHref('/create-account', returnTo)}
                onClick={(event) => {
                  if (onNavigate) {
                    event.preventDefault()
                    onNavigate(accountAccessHref('/create-account', returnTo))
                  }
                }}
              >
                Create account
              </Link>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </main>
  )
}
