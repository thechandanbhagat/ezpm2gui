// @group Utilities : Footer/application version labels
export function formatVersionLabel(version: string | null | undefined): string {
  const cleaned = version?.trim().replace(/^v/i, '');
  return cleaned ? `v${cleaned}` : 'v...';
}
