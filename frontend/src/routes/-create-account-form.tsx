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

import { accountAccessHref } from './-return-target'
import styles from './account-access.module.css'

export interface CreateAccountFormProps {
  onNavigate?: (href: string) => void
  returnTo?: string
}

const passwordGuidance =
  'Use at least six characters, including one uppercase letter and one special character.'

function passwordMeetsPolicy(password: string): boolean {
  if (password.length < 6) {
    return false
  }

  const hasUppercase = /[A-Z]/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)

  return hasUppercase && hasSpecial
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

export function CreateAccountForm({
  onNavigate,
  returnTo,
}: CreateAccountFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string>()
  const [emailError, setEmailError] = useState<string>()
  const [passwordError, setPasswordError] = useState<string>()
  const [confirmPasswordError, setConfirmPasswordError] = useState<string>()
  const [successMessage, setSuccessMessage] = useState<string>()
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const confirmPasswordInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (emailError) {
      emailInput.current?.focus()
    } else if (passwordError) {
      passwordInput.current?.focus()
    } else if (confirmPasswordError) {
      confirmPasswordInput.current?.focus()
    }
  }, [emailError, passwordError, confirmPasswordError])

  function validateClientFields(): boolean {
    const trimmedEmail = email.trim()
    const nextEmailError =
      trimmedEmail.length === 0
        ? 'Enter an email address.'
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
          ? 'Enter a valid email address.'
          : undefined

    const nextPasswordError =
      password.length === 0
        ? 'Enter a password.'
        : !passwordMeetsPolicy(password)
          ? 'Use at least 6 characters including an uppercase letter and special character.'
          : undefined

    const nextConfirmPasswordError =
      confirmPassword.length === 0
        ? 'Confirm your password.'
        : password !== confirmPassword
          ? 'Passwords do not match.'
          : undefined

    setEmailError(nextEmailError)
    setPasswordError(nextPasswordError)
    setConfirmPasswordError(nextConfirmPasswordError)

    return !(nextEmailError || nextPasswordError || nextConfirmPasswordError)
  }

  async function submit(): Promise<void> {
    setError(undefined)
    setEmailError(undefined)
    setPasswordError(undefined)
    setConfirmPasswordError(undefined)
    setSuccessMessage(undefined)

    if (!validateClientFields()) {
      return
    }

    try {
      const response = await fetch('/api/v1/applicant-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.api+json',
          Accept: 'application/vnd.api+json',
        },
        body: JSON.stringify({
          data: {
            type: 'applicant-accounts',
            attributes: {
              email: email.trim(),
              password,
            },
          },
        }),
      })

      if (response.ok) {
        setPassword('')
        setConfirmPassword('')
        setSuccessMessage(
          'Account created successfully. You can now sign in to continue your application.',
        )
        return
      }

      const parsed = (await response.json().catch(() => null)) as unknown
      const details = parseErrorMessages(parsed)
      const code =
        parsed &&
        typeof parsed === 'object' &&
        'errors' in parsed &&
        Array.isArray(parsed.errors)
          ? parsed.errors[0]
          : null

      if (code && typeof code === 'object' && code !== null && 'code' in code) {
        const errorCode = code.code
        const pointer =
          'source' in code &&
          code.source &&
          typeof code.source === 'object' &&
          'pointer' in code.source
            ? code.source.pointer
            : undefined

        if (errorCode === 'email-already-registered') {
          setError('An account already exists for this email address.')
          return
        }

        if (errorCode === 'rate-limited') {
          setError('Too many attempts. Please wait a moment and try again.')
          return
        }

        if (errorCode === 'unsupported-media-type') {
          setError('Use application/vnd.api+json for JSON:API request bodies.')
          return
        }

        if (pointer === '/data/attributes/email') {
          setEmailError(details[0] || 'Enter a valid email address.')
          return
        }

        if (pointer === '/data/attributes/password') {
          setPasswordError(
            details[0] ||
              'Use at least 6 characters including an uppercase letter and special character.',
          )
          return
        }
      }

      if (details.length > 0) {
        setError(details[0])
        return
      }

      setError('Account creation could not be completed. Please try again.')
    } catch {
      setError('Network error. Check your connection and try again.')
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
                Create your account
              </Typography>
              <Typography tone="muted">
                Create credentials to begin your KYC application.
              </Typography>
            </Stack>
            {(error ?? emailError ?? passwordError ?? confirmPasswordError) ? (
              <Alert aria-live="assertive" role="alert" severity="error">
                {error ?? emailError ?? passwordError ?? confirmPasswordError}
              </Alert>
            ) : null}
            {successMessage ? (
              <Alert aria-live="polite" role="status" severity="success">
                {successMessage}
              </Alert>
            ) : null}
            <TextField
              autoComplete="email"
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
                setConfirmPasswordError(undefined)
              }}
              required
              type="email"
              value={email}
            />
            <TextField
              autoComplete="new-password"
              error={Boolean(passwordError)}
              fullWidth
              helperText={passwordError ?? passwordGuidance}
              id="applicant-password"
              inputRef={passwordInput}
              label="Password"
              name="password"
              onChange={(event) => {
                setPassword(event.target.value)
                setEmailError(undefined)
                setPasswordError(undefined)
                setConfirmPasswordError(undefined)
              }}
              required
              type="password"
              value={password}
            />
            <TextField
              autoComplete="new-password"
              error={Boolean(confirmPasswordError)}
              fullWidth
              helperText={confirmPasswordError}
              id="applicant-password-confirmation"
              inputRef={confirmPasswordInput}
              label="Confirm password"
              name="confirmPassword"
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                setEmailError(undefined)
                setPasswordError(undefined)
                setConfirmPasswordError(undefined)
              }}
              required
              type="password"
              value={confirmPassword}
            />
            <Button
              className={styles.submit}
              fullWidth
              size="large"
              type="submit"
            >
              Create account
            </Button>
            {successMessage ? (
              <Button
                fullWidth
                size="large"
                onClick={() => {
                  if (onNavigate) {
                    onNavigate(accountAccessHref('/sign-in', returnTo))
                    return
                  }
                  window.location.assign(
                    accountAccessHref('/sign-in', returnTo),
                  )
                }}
                type="button"
              >
                Go to sign in
              </Button>
            ) : null}
            <Typography
              className={styles.footer}
              align="center"
              variant="caption"
            >
              <span>Already have an account? </span>
              <Link
                href={accountAccessHref('/sign-in', returnTo)}
                onClick={(event) => {
                  if (onNavigate) {
                    event.preventDefault()
                    onNavigate(accountAccessHref('/sign-in', returnTo))
                  }
                }}
              >
                Sign in
              </Link>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </main>
  )
}
