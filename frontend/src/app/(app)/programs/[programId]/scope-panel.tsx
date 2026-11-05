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
import { ALERT, COUNT, DANGER_BUTTON, FIELD, NOTE, PANEL, ROW_BUTTON } from '../ui';

const PLACEHOLDER: Readonly<Record<RuleType, string>> = {
  domain: 'example.com',
  wildcard: '*.example.com',
  cidr: '198.51.100.0/24',
  url: 'https://example.com/api/',
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
          className={`${FIELD} sm:w-36`}
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
          className={FIELD}
        />
        <button type="submit" disabled={mutation.isPending} className={ROW_BUTTON}>
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
            className={FIELD}
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
  if (editing) {
    return (
      <li className="py-space-sm">
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
    <li className="flex items-start justify-between gap-space-sm py-space-sm">
      <div className="flex min-w-0 flex-col">
        <span className="break-all font-body-code text-body-code text-fg">{rule.value}</span>
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
      {canManage && (
        <span className="flex shrink-0 gap-space-xs">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${rule.value}`}
            className={ROW_BUTTON}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => remove.mutate(rule.id)}
            disabled={remove.isPending}
            aria-label={`Delete ${rule.value}`}
            className={DANGER_BUTTON}
          >
            Delete
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
      className={`${PANEL} flex flex-col gap-space-md p-space-md`}
    >
      <div className="flex items-center justify-between gap-space-sm">
        <h2 className="flex items-center gap-space-sm font-panel-title text-panel-title text-fg">
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
            {inScope ? 'verified' : 'block'}
          </span>
          {inScope ? 'In-Scope' : 'Out-of-Scope'}
        </h2>
        <span className="font-body-code text-caption text-fg-faint">
          {COUNT.format(rules.length)} {rules.length === 1 ? 'rule' : 'rules'}
        </span>
      </div>
      <p className="text-body-default text-fg-muted">
        {inScope
          ? 'New assets do not create jobs. Jobs are created manually or by schedule.'
          : 'Jobs on out-of-scope targets are rejected at creation. The dispatcher re-checks scope and cancels jobs that no longer match.'}
      </p>
      {canManage && <RuleForm programId={programId} scopeType={scopeType} />}
      {rules.length === 0 ? (
        <p className="text-body-default text-fg-muted">
          {inScope ? 'No In-Scope rules yet.' : 'No Out-of-Scope rules.'}
        </p>
      ) : (
        <ul className="divide-y divide-border">
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
    <div className="grid grid-cols-1 gap-space-md xl:grid-cols-2">
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
