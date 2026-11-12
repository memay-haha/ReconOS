/** Values stamped into the bundle at build time by next.config.ts: the ReconOS version from
 * package.json for every version chip (decision N3, D6-B) and the node name of S01 from
 * RECONOS_NODE_NAME (docs/ops/configuration.md). Neither comes from Backend API. */
export const RECONOS_VERSION: string = process.env.RECONOS_VERSION ?? '';

/** Empty when RECONOS_NODE_NAME was not set at build: S01 then shows no node chip. */
export const RECONOS_NODE_NAME: string = process.env.RECONOS_NODE_NAME ?? '';

/** "v0.1.0", or null when the build carried no version. */
export function versionLabel(version: string = RECONOS_VERSION): string | null {
  return version === '' ? null : `v${version}`;
}
