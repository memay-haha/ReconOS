import type { ToolModuleRow } from '@/lib/tool-modules';

const COUNT = new Intl.NumberFormat('en-US');

/** Engine names are stored lower case; the glossary writes them Osmedeus, Vigolium. */
export function engineName(runsOn: string): string {
  return runsOn.charAt(0).toUpperCase() + runsOn.slice(1);
}

/** "Osmedeus (subfinder/amass)" for an engine workflow, "gowitness" for a plain tool. */
export function primaryEngine(m: ToolModuleRow): string {
  const tools = m.tools.join('/');
  if (m.runs_on === null) return tools === '' ? m.name : tools;
  return tools === '' ? engineName(m.runs_on) : `${engineName(m.runs_on)} (${tools})`;
}

export function outputContract(m: ToolModuleRow): string {
  return m.output_types.length === 0 ? 'Raw output only' : m.output_types.join(' / ');
}

/** N44: a tool module whose output holds findings counts findings, the rest count jobs. */
export function counterText(m: ToolModuleRow): string {
  return m.output_types.includes('finding')
    ? `${COUNT.format(m.finding_count)} findings indexed`
    : `${COUNT.format(m.jobs_24h)} ${m.jobs_24h === 1 ? 'job' : 'jobs'} in 24h`;
}
