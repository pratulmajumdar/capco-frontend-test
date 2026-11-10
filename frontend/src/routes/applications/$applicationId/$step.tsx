import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@kyc/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import styles from '../../application-step.module.css'

import { readCsrfToken } from '../../-return-target'

import type { Route } from './+types/$step'

const fieldLabels = {
  'personal-details': [
    { key: 'name', label: 'Name' },
    { key: 'dateOfBirth', label: 'Date of birth' },
    { key: 'country', label: 'Country' },
    { key: 'nationality', label: 'Nationality' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
  ],
  'identity-and-address': [
    { key: 'documentType', label: 'Document type' },
    { key: 'documentNumber', label: 'Document number' },
    { key: 'documentCountry', label: 'Document country' },
    { key: 'expiry', label: 'Expiry' },
    { key: 'street', label: 'Street' },
    { key: 'city', label: 'City' },
    { key: 'postal', label: 'Postal code' },
    { key: 'residentialCountry', label: 'Residential country' },
  ],
} as const

interface FormApiResponse {
  data?: {
    attributes?: {
      answers?: Record<string, unknown>
      version?: number
      currentStep?: string
    }
  }
}

function parseApiError(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || !('errors' in payload)) {
    return ''
  }

  const errors = payload.errors
  if (!Array.isArray(errors) || errors.length === 0) {
    return ''
  }

  const first = errors[0]
  if (first && typeof first === 'object' && 'detail' in first) {
    const detail = first.detail
    if (typeof detail === 'string' && detail.trim().length > 0) {
      return detail
    }
  }

  return ''
}

export default function CurrentApplicationStepPage({
  params,
}: Route.ComponentProps) {
  const navigate = useNavigate()
  const step =
    params.step === 'identity-and-address'
      ? 'identity-and-address'
      : 'personal-details'
  const [missing, setMissing] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [reviewConfirmation, setReviewConfirmation] = useState(false)
  const [reviewConfirmationError, setReviewConfirmationError] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string>()
  const [isSaving, setIsSaving] = useState(false)
  const [version, setVersion] = useState(0)
  const [formValues, setFormValues] = useState<
    Record<string, string | boolean>
  >({})

  useEffect(() => {
    let ignore = false

    async function loadForm() {
      try {
        const response = await fetch(
          `/api/v1/applicant-applications/${params.applicationId}/form`,
          {
            credentials: 'same-origin',
            headers: { Accept: 'application/vnd.api+json' },
          },
        )

        if (!response.ok) {
          if (response.status === 401) {
            if (!ignore) {
              void navigate('/sign-in')
            }
            return
          }
          throw new Error('Unable to load the saved application.')
        }

        const payload = (await response
          .json()
          .catch(() => null)) as FormApiResponse | null
        const answers = payload?.data?.attributes?.answers ?? {}
        const nextVersion = payload?.data?.attributes?.version ?? 0

        if (!ignore) {
          setVersion(nextVersion)
          setFormValues({
            ...Object.fromEntries(
              Object.entries(answers).map(([key, value]) => [
                key,
                typeof value === 'boolean' ? value : String(value ?? ''),
              ]),
            ),
          })
        }
      } catch {
        if (!ignore) {
          setError('Unable to load your saved progress right now.')
        }
      }
    }

    void loadForm()
    return () => {
      ignore = true
    }
  }, [navigate, params.applicationId])

  const buildAnswers = () => {
    const answers: Record<string, unknown> = {}

    for (const item of fieldLabels[step]) {
      const value = formValues[item.key]
      answers[item.key] = value === undefined || value === null ? '' : value
    }

    if (step === 'personal-details') {
      answers.consentConfirmed = !!formValues.consentConfirmed
    }

    return answers
  }

  const save = async (nextPath?: string): Promise<void> => {
    const nextFieldErrors = Object.fromEntries(
      fieldLabels[step]
        .filter(({ key }) => !String(formValues[key] ?? '').trim())
        .map(({ key, label }) => [key, `${label} is required!`]),
    )
    if (
      step === 'identity-and-address' &&
      !(document.getElementById('document-evidence') as HTMLInputElement | null)
        ?.files?.length
    ) {
      nextFieldErrors.documentEvidence = 'Document evidence is required!'
    }

    setFieldErrors(nextFieldErrors)
    const hasConsentError =
      step === 'personal-details' && formValues.consentConfirmed !== true
    setConsentError(hasConsentError)
    if (Object.keys(nextFieldErrors).length > 0 || hasConsentError) {
      const firstInvalidField = Object.keys(nextFieldErrors)[0]
      const firstInvalidInput =
        firstInvalidField === 'documentEvidence'
          ? document.getElementById('document-evidence')
          : firstInvalidField
            ? document.querySelector<HTMLInputElement>(
                `[name="${firstInvalidField}"]`,
              )
            : document.getElementById('consent-confirmed')
      firstInvalidInput?.focus()
      return
    }

    setMissing(false)
    setError(undefined)
    setSaved(false)

    if (isSaving) {
      return
    }

    setIsSaving(true)

    try {
      const csrfToken = readCsrfToken()
      const response = await fetch(
        `/api/v1/applicant-applications/${params.applicationId}/form`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/vnd.api+json',
            Accept: 'application/vnd.api+json',
            ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
          },
          body: JSON.stringify({
            data: {
              type: 'applicant-application-forms',
              id: params.applicationId,
              attributes: {
                step,
                answers: buildAnswers(),
                version,
              },
            },
          }),
        },
      )

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as unknown
        const detailText = parseApiError(payload)

        if (response.status === 401) {
          setError('Your session has expired. Please sign in again.')
          void navigate('/sign-in')
          return
        }

        if (response.status === 409) {
          setError('This draft was updated elsewhere. Refresh and try again.')
          return
        }

        if (response.status === 422 || response.status === 400) {
          setError(
            detailText || 'Please check the required fields and try again.',
          )
          return
        }

        if (response.status === 403) {
          setError('You do not have permission to save this form.')
          return
        }

        setError(
          detailText || 'Your changes could not be saved. Please try again.',
        )
        return
      }

      const payload = (await response
        .json()
        .catch(() => null)) as FormApiResponse | null
      const nextVersion = payload?.data?.attributes?.version ?? version
      setVersion(nextVersion)
      setSaved(true)

      if (nextPath) {
        void navigate(nextPath)
      }
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const advance = async () => {
    if (step === 'personal-details') {
      await save(`/applications/${params.applicationId}/identity-and-address`)
      return
    }

    await save(`/applications/${params.applicationId}/review`)
  }

  if (params.step === 'review') {
    return (
      <main className={styles.reviewPage}>
        <Card className={styles.reviewCard}>
          <CardContent>
            <Stack spacing={2}>
              <Typography component="h1" variant="heading">
                Review application
              </Typography>
              <Typography>Your application is ready for review.</Typography>
              <label>
                <input
                  id="review-confirmation"
                  type="checkbox"
                  checked={reviewConfirmation}
                  required
                  aria-invalid={reviewConfirmationError}
                  aria-describedby={
                    reviewConfirmationError
                      ? 'review-confirmation-error'
                      : undefined
                  }
                  onChange={(event) => {
                    setReviewConfirmation(event.target.checked)
                    setReviewConfirmationError(false)
                  }}
                />{' '}
                I confirm the information is complete and accurate.
              </label>
              {reviewConfirmationError ? (
                <p id="review-confirmation-error" role="alert">
                  Please check the box to confirm your application is complete and accurate before submitting.
                </p>
              ) : null}
              <Button
                onClick={() => {
                  if (!reviewConfirmation) {
                    setReviewConfirmationError(true)
                    document.getElementById('review-confirmation')?.focus()
                    return
                  }

                  void navigate(
                    `/applications/${params.applicationId}/submitted`,
                  )
                }}
              >
                Submit
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void navigate(
                    `/applications/${params.applicationId}/identity-and-address`,
                  )
                }
              >
                Return to form
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Box component="div" className={styles.stepContent}>
        <Stack spacing={3}>
          <Typography component="p" variant="eyebrow" tone="accent">
            STEP {step === 'personal-details' ? '1' : '2'} OF 2
          </Typography>
          <Typography component="h1" variant="heading">
            {step === 'personal-details'
              ? 'Personal details'
              : 'Identity and address'}
          </Typography>
          <Typography tone="muted">
            Complete this form as part of the frontend implementation exercise.
          </Typography>
          <Stack
            component="form"
            className={styles.stepForm}
            onSubmit={(event) => {
              event.preventDefault()
              void advance()
            }}
            spacing={2}
          >
            {fieldLabels[step].map(({ key, label }) => {
              if (
                step === 'personal-details' &&
                key === ('consentConfirmed' as any)
              ) {
                return null
              }

              return (
                <TextField
                  key={key}
                  label={`${label} (required)`}
                  name={key}
                  error={Boolean(fieldErrors[key])}
                  helperText={fieldErrors[key]}
                  required
                  value={String(formValues[key] ?? '')}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setFormValues((current) => ({
                      ...current,
                      [key]: nextValue,
                    }))
                    if (nextValue.trim()) {
                      setFieldErrors((current) => {
                        const next = { ...current }
                        delete next[key]
                        return next
                      })
                    }
                    setSaved(false)
                    setError(undefined)
                  }}
                />
              )
            })}
            {step === 'personal-details' ? (
              <>
                <label>
                  <input
                    id="consent-confirmed"
                    checked={Boolean(formValues.consentConfirmed)}
                    aria-describedby={
                      consentError ? 'consent-error' : undefined
                    }
                    aria-invalid={consentError}
                    required
                    type="checkbox"
                    onChange={(event) => {
                      setFormValues((current) => ({
                        ...current,
                        consentConfirmed: event.target.checked,
                      }))
                      setConsentError(!event.target.checked)
                      setSaved(false)
                      setError(undefined)
                    }}
                  />{' '}
                  I confirm these details are accurate and belong to me.
                </label>
                {consentError ? (
                  <p id="consent-error" role="alert">
                    Confirm the information is accurate before continuing.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <label htmlFor="document-evidence">
                  Document evidence (required)
                </label>
                <input
                  id="document-evidence"
                  type="file"
                  accept="image/jpeg,image/png"
                  required
                  aria-invalid={Boolean(fieldErrors.documentEvidence)}
                  aria-describedby={
                    fieldErrors.documentEvidence
                      ? 'document-evidence-error'
                      : undefined
                  }
                  onChange={() => {
                    setFieldErrors((current) => {
                      const next = { ...current }
                      delete next.documentEvidence
                      return next
                    })
                  }}
                />
                {fieldErrors.documentEvidence ? (
                  <p id="document-evidence-error" role="alert">
                    {fieldErrors.documentEvidence}
                  </p>
                ) : null}
              </>
            )}
            {missing ? (
              <Alert role="alert" severity="error">
                Complete all required fields before continuing.
              </Alert>
            ) : null}
            {error ? (
              <Alert role="alert" severity="error">
                {error}
              </Alert>
            ) : null}
            {saved ? (
              <Alert role="status" severity="success">
                Your progress was saved.
              </Alert>
            ) : null}
            <Stack
              component="div"
              className={styles.formActions}
              direction="row"
              spacing={2}
            >
              <Button
                type="button"
                variant="quiet"
                onClick={() =>
                  step === 'personal-details'
                    ? void navigate('/applications/current')
                    : void navigate(
                        `/applications/${params.applicationId}/personal-details`,
                      )
                }
              >
                Back
              </Button>
              <Button type="submit" aria-busy={isSaving} disabled={isSaving}>
                {isSaving
                  ? 'Saving…'
                  : step === 'personal-details'
                    ? 'Continue'
                    : 'Save and review'}
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Box>
    </main>
  )
}
