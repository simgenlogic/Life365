/**
 * The six permanent navigation surfaces (PROJECT_SPEC.md §4).
 *
 * This list is fixed application structure. Packet data controls screen
 * *content*, never the navigation model.
 */
export const SURFACES = [
  { id: 'dashboard', label: 'Dashboard', icon: '■' },
  { id: 'catch-up', label: 'Catch Up', icon: '↺' },
  { id: 'ledger', label: 'Ledger', icon: '≡' },
  { id: 'packets', label: 'Packets', icon: '⬇' },
  { id: 'generate', label: 'Generate', icon: '↗' },
  { id: 'data', label: 'Data', icon: '⚙' },
] as const;

export type SurfaceId = (typeof SURFACES)[number]['id'];
