'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { fieldErrorsOf } from '@/lib/api-client';
import { formatMoment } from '@/lib/format-moment';
import {
  RULE_TYPE_LABEL,
  RULE_TYPES,
  type RuleType,
  type ScopeRule,
  type ScopeType,
  useCreateScopeRule,
  useDeleteScopeRule,
  useScopeRules,
  useUpdateScopeRule,
} from '@/lib/scope-rules';

import { errorText } from '../error-text';
import { ALERT, COUNT, NOTE, ROW_BUTTON } from '../ui';

/** Borderless fields and buttons, as the mockup's quick-add row draws them. */
const QUICK_FIELD =
  'h-9 w-full rounded-sm bg-surface-2 px-3 font-body-code text-body-code text-fg placeholder:text-fg-faint transition-colors focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring';
const QUICK_SELECT =
  'h-9 w-full rounded-sm bg-surface-2 px-2.5 text-body-default text-fg transition-colors focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring sm:w-36';
const QUICK_BUTTON =
  'flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm bg-surface-2 px-3 text-body-default transition-colors hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const ICON_BUTTON =
  'flex rounded-sm p-1 text-fg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

const PLACEHOLDER: Readonly<Record<RuleType, string>> = {
  domain: 'example.com',
  wildcard: '*.example.com',
  cidr: '198.51.100.0/24',
  url: 'https://example.com/api/',
};

/** Dot colour per rule type: the asset kind each rule matches. */
const DOT: Readonly<Record<RuleType, string>> = {
  domain: 'bg-asset-domain',
  wildcard: 'bg-asset-domain',
  cidr: 'bg-asset-ip',
  url: 'bg-asset-url',
};

function RuleForm({
  programId,
  scopeType,
  rule,
  onDone,
}: {
  programId: string;
  scopeType: ScopeType;
  /** Present: edit this rule instead of adding one. */
  rule?: ScopeRule;
  onDone?: () => void;
}): ReactElement {
  const create = useCreateScopeRule(programId);
  const update = useUpdateScopeRule();
  const mutation = rule === undefined ? create : update;
  const [ruleType, setRuleType] = useState<RuleType>(rule?.rule_type ?? 'wildcard');
  const [value, setValue] = useState(rule?.value ?? '');
  const [reason, setReason] = useState(rule?.reason ?? '');
  const errors = fieldErrorsOf(mutation.error);
  const failed =
    mutation.error !== null && Object.keys(errors).length === 0
      ? errorText(mutation.error, 'Could not save the scope rule.')
      : null;
  const outOfScope = scopeType === 'out_of_scope';
  const idPrefix = `${scopeType}-${rule?.id ?? 'new'}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = {
      scope_type: scopeType,
      rule_type: ruleType,
      value: value.trim(),
      reason: outOfScope ? reason.trim() : null,
    };
    const finish = () => {
      if (rule === undefined) {
        setValue('');
        setReason('');
      }
      onDone?.();
    };
    if (rule === undefined) create.mutate(body, { onSuccess: finish });
    else update.mutate({ id: rule.id, body }, { onSuccess: finish });
  };

  return (
    <form
      onSubmit={submit}
      aria-label={
        rule === undefined
          ? `Add ${outOfScope ? 'Out-of-Scope' : 'In-Scope'} rule`
          : 'Edit scope rule'
      }
      className="flex flex-col gap-space-sm bg-surface"
      noValidate
    >
      <div className="flex flex-col gap-space-sm sm:flex-row">
        <label htmlFor={`${idPrefix}-type`} className="sr-only">
          Rule type
        </label>
        <select
          id={`${idPrefix}-type`}
          value={ruleType}
          onChange={(e) => setRuleType(e.target.value as RuleType)}
          className={QUICK_SELECT}
        >
          {RULE_TYPES.map((type) => (
            <option key={type} value={type}>
              {RULE_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
        <label htmlFor={`${idPrefix}-value`} className="sr-only">
          Value
        </label>
        <input
          id={`${idPrefix}-value`}
          required
          value={value}
          placeholder={PLACEHOLDER[ruleType]}
          onChange={(e) => setValue(e.target.value)}
          className={QUICK_FIELD}
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className={`${QUICK_BUTTON} ${outOfScope ? 'text-crit' : 'text-fg'}`}
        >
          {rule === undefined && (
            <span
              aria-hidden="true"
              className={`material-symbols-outlined text-[16px] ${outOfScope ? 'text-crit' : 'text-good'}`}
            >
              add
            </span>
          )}
          {rule === undefined ? (outOfScope ? 'Add Exclusion' : 'Add Rule') : 'Save'}
        </button>
        {rule !== undefined && (
          <button type="button" onClick={onDone} className={ROW_BUTTON}>
            Cancel
          </button>
        )}
      </div>
      <FieldError errors={errors} field="value" />
      <FieldError errors={errors} field="rule_type" />
      {outOfScope && (
        <>
          <label htmlFor={`${idPrefix}-reason`} className="text-caption text-fg-muted">
            Reason (required)
          </label>
          <input
            id={`${idPrefix}-reason`}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={QUICK_FIELD}
          />
          <FieldError errors={errors} field="reason" />
        </>
      )}
      {failed !== null && (
        <p role="alert" className="text-body-default text-crit-strong">
          {failed}
        </p>
      )}
    </form>
  );
}

function RuleRow({
  rule,
  canManage,
  programId,
}: {
  rule: ScopeRule;
  canManage: boolean;
  programId: string;
}): ReactElement {
  const remove = useDeleteScopeRule();
  const [editing, setEditing] = useState(false);
  const outOfScope = rule.scope_type === 'out_of_scope';
  if (editing) {
    return (
      <li className="rounded-sm bg-surface-2 p-2.5">
        <RuleForm
          programId={programId}
          scopeType={rule.scope_type}
          rule={rule}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }
  return (
    <li className="group flex items-center justify-between gap-space-sm rounded-sm bg-surface-2/60 p-2.5 transition-colors hover:bg-surface-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${outOfScope ? 'bg-crit' : DOT[rule.rule_type]}`}
        />
        <div className="flex min-w-0 flex-col">
          <span
            className={`break-all font-body-code-bold text-body-code ${outOfScope ? 'text-crit' : 'text-fg'}`}
          >
            {rule.value}
          </span>
          <span className="text-caption text-fg-faint">
            {RULE_TYPE_LABEL[rule.rule_type]} · added {formatMoment(rule.created_at)}
          </span>
          {rule.reason !== null && (
            <span className="text-caption text-fg-muted">Reason: {rule.reason}</span>
          )}
          {remove.isError && (
            <span role="alert" className="text-caption text-crit-strong">
              {errorText(remove.error, 'Could not delete the scope rule.')}
            </span>
          )}
        </div>
      </div>
      {canManage && (
        <span className="ml-2 flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${rule.value}`}
            title="Edit scope rule"
            className={`${ICON_BUTTON} hover:bg-surface-3 hover:text-fg`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              edit
            </span>
          </button>
          <button
            type="button"
            onClick={() => remove.mutate(rule.id)}
            disabled={remove.isPending}
            aria-label={`Delete ${rule.value}`}
            title="Delete scope rule"
            className={`${ICON_BUTTON} hover:bg-crit-soft hover:text-crit`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              delete
            </span>
          </button>
        </span>
      )}
    </li>
  );
}

function RuleSection({
  programId,
  scopeType,
  rules,
  canManage,
}: {
  programId: string;
  scopeType: ScopeType;
  rules: readonly ScopeRule[];
  canManage: boolean;
}): ReactElement {
  const inScope = scopeType === 'in_scope';
  return (
    <section
      aria-label={inScope ? 'In-Scope' : 'Out-of-Scope'}
      className="flex flex-col gap-space-md rounded-sm bg-surface p-space-lg shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 font-panel-title text-panel-title text-fg">
            <span
              aria-hidden="true"
              className={`material-symbols-outlined text-[18px] ${inScope ? 'text-good' : 'text-crit'}`}
            >
              {inScope ? 'verified' : 'block'}
            </span>
            {inScope ? 'In-Scope' : 'Out-of-Scope'}
          </h2>
          <span
            className={`rounded-sm px-2 py-0.5 font-body-code text-caption ${
              inScope
                ? 'bg-surface-2 font-medium text-fg-muted'
                : 'bg-crit-soft font-semibold text-crit'
            }`}
          >
            {COUNT.format(rules.length)} {rules.length === 1 ? 'rule' : 'rules'}
          </span>
        </div>
        {inScope && (
          <p className="text-caption text-fg-muted">
            New assets do not create jobs. Jobs are created manually or by schedule.
          </p>
        )}
      </div>
      {!inScope && (
        <div className="flex items-start gap-2.5 rounded-sm bg-warn-soft p-2.5">
          <span
            aria-hidden="true"
            className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-warn"
          >
            warning
          </span>
          <p className="text-caption leading-snug text-warn">
            Jobs on out-of-scope targets are rejected at creation. The dispatcher re-checks scope
            and cancels jobs that no longer match.
          </p>
        </div>
      )}
      {canManage && <RuleForm programId={programId} scopeType={scopeType} />}
      {rules.length === 0 ? (
        <p className="text-body-default text-fg-muted">
          {inScope ? 'No In-Scope rules yet.' : 'No Out-of-Scope rules.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} canManage={canManage} programId={programId} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The scope tab: In-Scope beside Out-of-Scope, as the mockup draws them. */
export function ScopePanel({
  programId,
  canManage,
}: {
  programId: string;
  canManage: boolean;
}): ReactElement {
  const rules = useScopeRules(programId);
  if (rules.isPending) return <p className={NOTE}>Loading scope rules…</p>;
  if (rules.isError) {
    return (
      <p role="alert" className={ALERT}>
        {errorText(rules.error, 'Could not load the scope rules.')}
      </p>
    );
  }
  const items = rules.data.items;
  return (
    <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-2">
      <RuleSection
        programId={programId}
        scopeType="in_scope"
        rules={items.filter((r) => r.scope_type === 'in_scope')}
        canManage={canManage}
      />
      <RuleSection
        programId={programId}
        scopeType="out_of_scope"
        rules={items.filter((r) => r.scope_type === 'out_of_scope')}
        canManage={canManage}
      />
    </div>
  );
}
