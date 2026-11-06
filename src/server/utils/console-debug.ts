// Debug traces use console.log. They stay off unless EZPM2GUI_DEBUG is set.
// console.warn and console.error are unchanged.

export function isConsoleDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (env.EZPM2GUI_DEBUG ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export function applyServerConsolePolicy(env: NodeJS.ProcessEnv = process.env): void {
  if (isConsoleDebugEnabled(env)) return;
  console.log = () => {};
}
