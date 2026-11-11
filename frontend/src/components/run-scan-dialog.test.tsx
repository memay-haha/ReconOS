import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';
import type { ToolModule } from '@/lib/tool-modules';

import { RunScanDialog } from './run-scan-dialog';

function module(id: string, name: string, group: ToolModule['group']): ToolModule {
  return {
    id,
    name,
    group,
    is_enabled: true,
    default_params: {},
    max_concurrency: 1,
    rate_limit_per_minute: null,
    timeout_minutes: 60,
    updated_at: '2026-11-05T00:00:00Z',
  };
}

const MODULES = [module('m1', 'nuclei', 'scan'), module('m2', 'sqlmap', 'exploit')];

function draw(overrides: Partial<Parameters<typeof RunScanDialog>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <RunScanDialog
      open
      programName="Example"
      targets={['a.example.com']}
      editableTargets
      toolModules={MODULES}
      pending={false}
      error={null}
      onSubmit={onSubmit}
      onClose={() => {}}
      {...overrides}
    />,
  );
  return onSubmit;
}

describe('RunScanDialog', () => {
  it('submits one tool module and the trimmed targets', async () => {
    const onSubmit = draw();
    await userEvent.click(screen.getByRole('button', { name: /create job/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      toolModuleId: 'm1',
      target: ['a.example.com'],
      priority: 'normal',
      params: {},
    });
  });

  it('sends the priority and the parameters the tool module declares (D7-A, D8)', async () => {
    const onSubmit = draw({
      toolModules: [
        {
          ...MODULES[0]!,
          default_params: { rate: 50 },
          param_schema: {
            properties: {
              rate: { type: 'integer', title: 'Rate', minimum: 1, maximum: 500, default: 150 },
              tags: { type: 'string', title: 'Tags' },
              follow: { type: 'boolean', title: 'Follow redirects', default: true },
            },
          },
        },
      ],
    });
    expect(screen.getByLabelText('Rate')).toHaveValue(50);
    await userEvent.clear(screen.getByLabelText('Rate'));
    await userEvent.type(screen.getByLabelText('Rate'), '200');
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'high');
    await userEvent.click(screen.getByRole('button', { name: /create job/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      toolModuleId: 'm1',
      target: ['a.example.com'],
      priority: 'high',
      params: { rate: 200, follow: true },
    });
  });

  it('says an exploit tool module needs approval', async () => {
    draw();
    expect(screen.queryByText(/requires approval/i)).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText(/tool module/i), 'm2');
    expect(screen.getByText(/requires approval/i)).toBeInTheDocument();
  });

  it('names an out-of-scope rejection without the backend title', () => {
    draw({
      error: new ApiError(422, { title: 'Unprocessable', code: 'target_out_of_scope' }, null),
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/outside the program scope/i);
    expect(screen.queryByText('Unprocessable')).toBeNull();
  });
});
