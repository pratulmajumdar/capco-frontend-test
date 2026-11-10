import { Stack } from '@kyc/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import {
  ApplicantJourneyPresentation,
  type ApplicantJourneyPresentationFixture,
} from './-applicant-journey-presentation'
import { readCsrfToken } from '../-return-target'

interface JourneyApiResponse {
  data?: {
    id?: string
    attributes?: {
      currentStep?: string
      progress?: Array<{ step?: string; state?: string }>
    }
  }
}

function toFixture(payload: JourneyApiResponse | null): ApplicantJourneyPresentationFixture {
  const progress = payload?.data?.attributes?.progress ?? [
    { step: 'personal-details', state: 'current' },
    { step: 'identity-and-address', state: 'remaining' },
  ]

  const mappedProgress = progress
    .filter((step) => step.step === 'personal-details' || step.step === 'identity-and-address')
    .map((step) => ({
      step: step.step as 'personal-details' | 'identity-and-address',
      state:
        step.state === 'complete'
          ? 'complete'
          : step.state === 'current'
            ? 'current'
            : 'remaining' as ApplicantJourneyPresentationFixture['progress'][number]['state'],
    }))

  const currentStep = payload?.data?.attributes?.currentStep
  const entryState =
    mappedProgress.some((item) => item.state === 'complete' || item.state === 'current')
      ? 'resume'
      : 'start'

  return {
    entryState,
    progress:
      mappedProgress.length > 0
        ? mappedProgress
        : [
            { step: 'personal-details', state: currentStep === 'personal-details' ? 'current' : 'remaining' },
            { step: 'identity-and-address', state: currentStep === 'identity-and-address' ? 'current' : 'remaining' },
          ],
  }
}

export default function CurrentApplicationJourneyPage() {
  const navigate = useNavigate()
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [fixture, setFixture] = useState<ApplicantJourneyPresentationFixture>(() => ({
    entryState: 'start',
    progress: [
      { step: 'personal-details', state: 'current' },
      { step: 'identity-and-address', state: 'remaining' },
    ],
  }))

  useEffect(() => {
    let ignore = false

    async function loadCurrentApplication() {
      try {
        const response = await fetch('/api/v1/applicant-applications/current', {
          credentials: 'same-origin',
          headers: { Accept: 'application/vnd.api+json' },
        })

        if (response.status === 204) {
          if (!ignore) {
            setApplicationId(null)
            setFixture({
              entryState: 'start',
              progress: [
                { step: 'personal-details', state: 'current' },
                { step: 'identity-and-address', state: 'remaining' },
              ],
            })
          }
          return
        }

        const payload = response.ok
          ? ((await response.json().catch(() => null)) as JourneyApiResponse | null)
          : null

        if (!ignore) {
          setApplicationId(payload?.data?.id ?? null)
          setFixture(toFixture(payload))
        }
      } catch {
        if (!ignore) {
          setFixture({
            entryState: 'start',
            progress: [
              { step: 'personal-details', state: 'current' },
              { step: 'identity-and-address', state: 'remaining' },
            ],
          })
        }
      }
    }

    void loadCurrentApplication()
    return () => {
      ignore = true
    }
  }, [])

  const handlePrimaryAction = async () => {
    try {
      if (applicationId) {
        const currentStep = fixture.progress.find((step) => step.state === 'current')?.step ?? 'personal-details'
        void navigate(`/applications/${applicationId}/${currentStep}`)
        return
      }

      const csrfToken = readCsrfToken()
      const response = await fetch('/api/v1/applicant-applications', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/vnd.api+json',
          ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          void navigate('/sign-in')
          return
        }
        throw new Error('Unable to start application.')
      }

      const payload = (await response.json().catch(() => null)) as JourneyApiResponse | null
      const nextApplicationId = payload?.data?.id
      const currentStep = payload?.data?.attributes?.currentStep ?? 'personal-details'
      if (!nextApplicationId) {
        throw new Error('Application was not created.')
      }
      void navigate(`/applications/${nextApplicationId}/${currentStep}`)
    } catch {
      void navigate('/sign-in')
    }
  }

  return (
    <Stack spacing={2}>
      <ApplicantJourneyPresentation
        {...fixture}
        onPrimaryAction={() => {
          void handlePrimaryAction()
        }}
      />
    </Stack>
  )
}
