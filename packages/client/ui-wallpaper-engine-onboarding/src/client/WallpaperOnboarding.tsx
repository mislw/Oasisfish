/** First-run Wallpaper Engine setup prompt. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WallpaperOnboardingCopy } from './locales.ts'
import type { WallpaperSettingsReadiness } from './probe.ts'
import css from './WallpaperOnboarding.module.css'

const ignoreImplicitDismiss = (): void => {}

/* v8 ignore next 3 -- closed-union default only defends future source widening */
function assertNever(_value: never): never {
  throw new Error('unexpected Wallpaper Engine readiness')
}

/** Registration-side dependencies of {@link WallpaperOnboarding}. */
export interface WallpaperOnboardingInjected {
  /** Localized copy captured for this registration generation. */
  copy: WallpaperOnboardingCopy
  /** Read upstream settings once under the mounted component lifetime. */
  probe: (signal: AbortSignal) => Promise<WallpaperSettingsReadiness>
  /** Report one bounded readiness diagnostic. */
  warn: (diagnostic: string) => void
}

/** Coordinator props plus Wallpaper Engine readiness dependencies. */
export type WallpaperOnboardingProps =
  PropsRuntime<'settings.onboarding'> & InjectFace<WallpaperOnboardingInjected>

/**
 * Prompt only desktops whose Wallpaper Engine settings are absent. Owner
 * callback replacements do not restart the probe; settlement uses the latest
 * completion callback.
 * @param props - onboarding coordinator callbacks and injected dependencies.
 * @returns the setup modal, or null while probing and after completion.
 */
export function WallpaperOnboarding({
  complete, openSection, copy, probe, warn,
}: WallpaperOnboardingProps): ReactNode {
  const [readiness, setReadiness] = useState<WallpaperSettingsReadiness>()
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const completed = useRef(false)
  const completeRef = useRef(complete)
  const warned = useRef(false)
  completeRef.current = complete
  const finish = useCallback((): void => {
    if (completed.current) return
    completed.current = true
    completeRef.current()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void probe(controller.signal).then((result) => {
      if (!active) return
      switch (result.kind) {
        case 'setup-required':
          setReadiness(result)
          return
        case 'configured':
          finish()
          return
        case 'unavailable':
          if (!warned.current) {
            warned.current = true
            warn(result.diagnostic)
          }
          finish()
          return
        default:
          return assertNever(result)
      }
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [finish, probe, warn])

  useEffect(() => {
    if (readiness?.kind !== 'setup-required') return
    const appRoot = document.getElementById('root')
    titleRef.current?.focus()
    if (appRoot === null) return
    const previous = appRoot.inert
    appRoot.inert = true
    return () => {
      appRoot.inert = previous
    }
  }, [readiness?.kind])

  if (readiness?.kind !== 'setup-required') return null

  const openSettings = (): void => {
    finish()
    openSection('wallpaper-engine')
  }

  return (
    <Modal
      open
      title={copy.title}
      onClose={ignoreImplicitDismiss}
      headless
      className={css.dialog as string}
    >
      <div className={css.content}>
        <h2 ref={titleRef} className={css.title} tabIndex={-1}>{copy.title}</h2>
        <p className={css.body}>{copy.body}</p>
        <div className={css.actions}>
          <Button variant="primary" onClick={openSettings}>{copy.openSettings}</Button>
        </div>
      </div>
    </Modal>
  )
}
