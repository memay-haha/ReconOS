import { redirect } from 'next/navigation';

import { RECONOS_NODE_NAME, versionLabel } from '@/lib/build-info';
import { readSessionForSignInScreen } from '@/lib/session';

import { ThemeToggle } from '@/components/theme-toggle';

import { LoginForm } from './login-form';
import { DispatcherPill, EncryptedNote } from './login-status';

const version = versionLabel();

export default async function LoginPage() {
  // Someone who already has a session has no business on the sign in screen. A backend
  // outage leaves this unknown, and the tolerant read then shows the form anyway.
  if ((await readSessionForSignInScreen()) !== null) redirect('/users');

  return (
    <>
      {/* The mockup's cyan glow behind the card. Decoration only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_srgb,var(--color-primary-container)_6%,transparent),transparent_65%)]"
      />
      <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between bg-bg/90 px-margin backdrop-blur-md">
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-space-xs">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">
              radar
            </span>
            <span className="font-panel-title text-panel-title font-bold uppercase tracking-tight text-fg">
              ReconOS
            </span>
            {/* Decisions N3, D6-B: the build version, stamped from package.json. */}
            {version === null ? null : (
              <span className="rounded-sm bg-surface-2 px-space-xs py-[2px] font-body-code text-body-code text-fg-muted">
                {version}
              </span>
            )}
          </div>
          <DispatcherPill />
        </div>
        <div className="flex items-center gap-space-sm">
          {/* D6-B: RECONOS_NODE_NAME at build; no chip when it was not set. */}
          {RECONOS_NODE_NAME === '' ? null : (
            <div className="flex items-center gap-space-xs rounded-sm bg-surface px-space-sm py-1 font-body-code text-body-code text-fg-muted">
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[16px] text-primary"
              >
                lock
              </span>
              <span className="hidden md:inline">{RECONOS_NODE_NAME}</span>
            </div>
          )}
          <ThemeToggle />
        </div>
      </header>
      <main className="relative z-10 flex min-h-dvh w-full items-center justify-center px-margin-mobile pt-14 sm:px-margin">
        <div className="relative flex w-full flex-col items-center justify-center py-6 sm:py-10">
          {/* The mockup's two blurred halos. Decoration only. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-36 -top-40 h-96 w-96 rounded-full bg-primary/10 blur-[120px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-40 -right-36 h-96 w-96 rounded-full bg-asset-service/10 blur-[130px]"
          />
          <div className="relative z-10 mx-auto w-full max-w-[392px]">
            <div className="h-1 w-full rounded-t-xl bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />
            <div className="relative flex flex-col rounded-b-xl bg-surface p-7 shadow-2xl shadow-black/80 sm:p-8">
              <div className="mb-6">
                <h1 className="mb-1.5 font-headline-lg text-headline-lg tracking-tight text-fg">
                  Sign In
                </h1>
                <p className="font-body-default text-body-default text-fg-muted">
                  Enter your credentials to access the console.
                </p>
              </div>
              <LoginForm />
            </div>
          </div>
        </div>
      </main>
      <footer className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 flex h-10 items-center justify-between px-margin">
        <div className="pointer-events-auto flex w-full items-center justify-between font-body-code text-caption text-fg-faint">
          <span>&copy; ReconOS Security Systems</span>
          <EncryptedNote />
        </div>
      </footer>
    </>
  );
}
