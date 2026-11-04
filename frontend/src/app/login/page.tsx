import { redirect } from 'next/navigation';

import { readSessionForSignInScreen } from '@/lib/session';

import { LoginForm } from './login-form';

export default async function LoginPage() {
  // Someone who already has a session has no business on the sign in screen. A backend
  // outage leaves this unknown, and the tolerant read then shows the form anyway.
  if ((await readSessionForSignInScreen()) !== null) redirect('/users');

  return (
    <main className="flex min-h-dvh items-center justify-center px-margin-mobile py-space-xl sm:px-margin">
      <div className="w-full max-w-[392px] rounded-lg bg-surface p-margin sm:p-space-xl">
        <h1 className="font-headline-lg text-headline-lg text-fg">Đăng nhập</h1>
        <p className="mb-space-xl mt-space-xs font-body-default text-body-default text-fg-muted">
          Nhập thông tin tài khoản để vào ReconOS.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
