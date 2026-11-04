'use client';

import { type FormEvent, type ReactElement, type RefObject, useRef, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { ApiError, fieldErrorsOf } from '@/lib/api-client';
import { type UserCore, type UserRow, useCreateUser, useUpdateUser } from '@/lib/users';

const ROLES: readonly { value: UserRow['role']; label: string }[] = [
  { value: 'superadmin', label: 'Superadmin' },
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
];

const LABEL = 'text-label-caps uppercase text-fg-muted';
const FIELD =
  'h-10 w-full rounded-sm border border-border bg-surface-2 px-space-md text-body-default text-fg ' +
  'focus:outline-none focus:ring-2 focus:ring-ring';

function failureText(error: unknown): string {
  // A duplicate username is a flat 409 with no field member, so it cannot sit by the input.
  if (error instanceof ApiError && error.status === 409) {
    return 'This username is already taken.';
  }
  return 'Could not save the account. Try again later.';
}

export type UserFormProps =
  | { mode: 'create'; user?: never; onDone: () => void }
  | { mode: 'edit'; user: UserCore; onDone: () => void };

/** Two components, one per mode, so each calls exactly the hook it needs and
 * edit mode always has a real account id to patch. */
export function UserForm(props: UserFormProps): ReactElement {
  return props.mode === 'create' ? (
    <CreateUserForm onDone={props.onDone} />
  ) : (
    <EditUserForm user={props.user} onDone={props.onDone} />
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }): ReactElement {
  const create = useCreateUser();
  // Uncontrolled on purpose: React mirrors a controlled input's value into the
  // DOM `value` attribute, which would put the password into the markup.
  const passwordRef = useRef<HTMLInputElement>(null);
  return (
    <FormBody
      mode="create"
      initialName=""
      initialRole="user"
      passwordRef={passwordRef}
      mutation={create}
      onDone={onDone}
      submit={(v, done) =>
        create.mutate(
          {
            username: v.username,
            display_name: v.displayName,
            password: passwordRef.current?.value ?? '',
            role: v.role,
          },
          {
            onSuccess: () => {
              if (passwordRef.current !== null) passwordRef.current.value = '';
              done();
            },
          },
        )
      }
    />
  );
}

function EditUserForm({ user, onDone }: { user: UserCore; onDone: () => void }): ReactElement {
  const update = useUpdateUser(user.id);
  return (
    <FormBody
      mode="edit"
      initialName={user.display_name}
      initialRole={user.role}
      mutation={update}
      onDone={onDone}
      submit={(v, done) =>
        update.mutate({ display_name: v.displayName, role: v.role }, { onSuccess: done })
      }
    />
  );
}

interface FormValues {
  readonly username: string;
  readonly displayName: string;
  readonly role: UserRow['role'];
}

function FormBody({
  mode,
  initialName,
  initialRole,
  passwordRef,
  mutation,
  onDone,
  submit,
}: {
  mode: 'create' | 'edit';
  initialName: string;
  initialRole: UserRow['role'];
  passwordRef?: RefObject<HTMLInputElement | null>;
  mutation: { error: unknown; isPending: boolean };
  onDone: () => void;
  submit: (values: FormValues, done: () => void) => void;
}): ReactElement {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(initialName);
  const [role, setRole] = useState<UserRow['role']>(initialRole);
  const active = mutation;
  const errors = fieldErrorsOf(active.error);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit({ username, displayName, role }, onDone);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-space-md rounded-sm border border-border p-space-md"
    >
      {mode === 'create' && (
        <div className="flex flex-col gap-space-xs">
          <label htmlFor="user-username" className={LABEL}>
            Username
          </label>
          <input
            id="user-username"
            autoComplete="off"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={FIELD}
          />
          <FieldError errors={errors} field="username" />
        </div>
      )}

      <div className="flex flex-col gap-space-xs">
        <label htmlFor="user-display-name" className={LABEL}>
          Display name
        </label>
        <input
          id="user-display-name"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={FIELD}
        />
        <FieldError errors={errors} field="display_name" />
      </div>

      {mode === 'create' && (
        <div className="flex flex-col gap-space-xs">
          <label htmlFor="user-password" className={LABEL}>
            Password
          </label>
          <input
            id="user-password"
            type="password"
            autoComplete="new-password"
            required
            ref={passwordRef}
            className={FIELD}
          />
          <FieldError errors={errors} field="password" />
        </div>
      )}

      <div className="flex flex-col gap-space-xs">
        <label htmlFor="user-role" className={LABEL}>
          Role
        </label>
        <select
          id="user-role"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRow['role'])}
          className={FIELD}
        >
          {ROLES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <FieldError errors={errors} field="role" />
      </div>

      {active.error !== null && Object.keys(errors).length === 0 && (
        <p
          role="alert"
          className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
        >
          {failureText(active.error)}
        </p>
      )}

      <div className="flex gap-space-sm">
        <button
          type="submit"
          disabled={active.isPending}
          className="h-10 rounded-sm bg-primary px-space-xl text-panel-title text-on-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-10 rounded-sm border border-border px-space-xl text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
