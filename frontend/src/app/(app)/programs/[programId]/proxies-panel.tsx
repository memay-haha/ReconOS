'use client';

import { type FormEvent, type ReactElement, useRef, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { Pagination, useCursorStack } from '@/components/pagination';
import { fieldErrorsOf } from '@/lib/api-client';
import { formatMoment } from '@/lib/format-moment';
import { useCreateProxy, useDeleteProxy, useProxies, useUpdateProxy } from '@/lib/proxies';

import { errorText } from '../error-text';
import { ALERT, DANGER_BUTTON, FIELD, LABEL, NOTE, PANEL, ROW_BUTTON, TD, TH } from '../ui';

/** Shown in place of every proxy URL: the URL may hold a user name and password. */
const MASK = '••••••••';

function ProxyForm({ programId }: { programId: string }): ReactElement {
  const create = useCreateProxy(programId);
  const [name, setName] = useState('');
  // Uncontrolled, read through the ref: a controlled value would copy the credential into
  // the DOM value attribute (.claude/rules/security.md).
  const urlRef = useRef<HTMLInputElement>(null);
  const errors = fieldErrorsOf(create.error);
  const failed =
    create.error !== null && Object.keys(errors).length === 0
      ? errorText(create.error, 'Could not add the proxy.')
      : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const url = urlRef.current?.value ?? '';
    create.mutate(
      { name: name.trim(), url },
      {
        onSuccess: () => {
          setName('');
          if (urlRef.current !== null) urlRef.current.value = '';
        },
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      method="post"
      aria-label="Add a proxy"
      className="grid grid-cols-1 gap-space-sm bg-surface md:grid-cols-3 md:items-end"
      noValidate
    >
      <div className="flex flex-col gap-space-xs">
        <label htmlFor="proxy-name" className={LABEL}>
          Name
        </label>
        <input
          id="proxy-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FIELD}
        />
        <FieldError errors={errors} field="name" />
      </div>
      <div className="flex flex-col gap-space-xs">
        <label htmlFor="proxy-url" className={LABEL}>
          Proxy URL
        </label>
        <input id="proxy-url" ref={urlRef} type="password" autoComplete="off" className={FIELD} />
        <FieldError errors={errors} field="url" />
      </div>
      <button type="submit" disabled={create.isPending} className={ROW_BUTTON}>
        Add proxy
      </button>
      {failed !== null && (
        <p role="alert" className="text-body-default text-crit-strong md:col-span-3">
          {failed}
        </p>
      )}
    </form>
  );
}

/** The proxies tab, Superadmin and Admin only. The URL is write-only and always masked. */
export function ProxiesPanel({ programId }: { programId: string }): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const proxies = useProxies(programId, cursor);
  const update = useUpdateProxy();
  const remove = useDeleteProxy();
  const actionError = update.error ?? remove.error;

  return (
    <div className={`${PANEL} flex flex-col gap-space-md p-space-md`}>
      <h2 className="font-panel-title text-panel-title text-fg">Proxies</h2>
      <ProxyForm programId={programId} />
      {actionError !== null && (
        <p role="alert" className={ALERT}>
          {errorText(actionError, 'Could not change the proxy.')}
        </p>
      )}
      {proxies.isPending && <p className={NOTE}>Loading proxies…</p>}
      {proxies.isError && (
        <p role="alert" className={ALERT}>
          {errorText(proxies.error, 'Could not load the proxies.')}
        </p>
      )}
      {proxies.data !== undefined && proxies.data.items.length === 0 && (
        <p className={NOTE}>No proxies. Jobs of this program connect directly.</p>
      )}
      {proxies.data !== undefined && proxies.data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead className="border-b border-border bg-surface-2">
              <tr>
                <th className={TH}>Name</th>
                <th className={TH}>URL</th>
                <th className={TH}>Enabled</th>
                <th className={TH}>Updated</th>
                <th className={TH}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {proxies.data.items.map((proxy) => (
                <tr key={proxy.id}>
                  <td className={`${TD} font-body-code`}>{proxy.name}</td>
                  <td className={`${TD} font-body-code text-fg-muted`}>
                    <span aria-label="Hidden">{MASK}</span>
                  </td>
                  <td className={TD}>{proxy.is_enabled ? 'Yes' : 'No'}</td>
                  <td className={TD}>{formatMoment(proxy.updated_at)}</td>
                  <td className={TD}>
                    <span className="flex flex-wrap gap-space-xs">
                      <button
                        type="button"
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({ id: proxy.id, body: { is_enabled: !proxy.is_enabled } })
                        }
                        aria-label={`${proxy.is_enabled ? 'Disable' : 'Enable'} ${proxy.name}`}
                        className={ROW_BUTTON}
                      >
                        {proxy.is_enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(proxy.id)}
                        aria-label={`Delete ${proxy.name}`}
                        className={DANGER_BUTTON}
                      >
                        Delete
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {proxies.data !== undefined && (
        <Pagination
          label="Proxy list pagination"
          page={{
            total: proxies.data.total,
            totalIsEstimate: proxies.data.total_is_estimate,
            nextCursor: proxies.data.next_cursor,
          }}
          canGoBack={canGoBack}
          onBack={goBack}
          onNext={() => goNext(proxies.data.next_cursor)}
        />
      )}
    </div>
  );
}
