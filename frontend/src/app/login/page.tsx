import { redirect } from 'next/navigation';

import { readSessionForSignInScreen } from '@/lib/session';

import { LoginForm } from './login-form';

export default async function LoginPage() {
  // Someone who already has a session has no business on the sign in screen. A backend
  // outage leaves this unknown, and the tolerant read then shows the form anyway.
  if ((await readSessionForSignInScreen()) !== null) redirect('/users');

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between bg-bg px-margin">
        <div className="flex items-center gap-space-xs">
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-primary">
            radar
          </span>
          <span className="font-panel-title text-panel-title font-bold uppercase tracking-tight text-fg">
            ReconOS
          </span>
        </div>
      </header>
      <main className="relative flex min-h-dvh w-full items-center justify-center px-margin-mobile pt-14 sm:px-margin">
        <div className="relative mx-auto w-full max-w-sm py-space-xl">
          <div className="h-1 w-full rounded-t-xl bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />
          <div className="flex flex-col rounded-b-xl bg-surface p-space-xl shadow-2xl sm:p-margin">
            <div className="mb-space-xl">
              <h1 className="mb-space-xs font-headline-lg text-headline-lg tracking-tight text-fg">
                Sign In
              </h1>
              <p className="font-body-default text-body-default text-fg-muted">
                Enter your credentials to access the console.
              </p>
            </div>
            <LoginForm />
          </div>
        </div>
      </main>
      <footer className="fixed bottom-0 left-0 right-0 z-20 flex h-10 items-center justify-between px-margin font-body-code text-caption text-fg-faint">
        <span>&copy; ReconOS Security Systems</span>
        <span>All connections encrypted</span>
      </footer>
    </>
  );
}
