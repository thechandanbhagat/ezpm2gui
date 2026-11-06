// Browser debug traces use console.log. Leave them off unless debugging.
// console.warn and console.error still show. Set localStorage ezpm2gui-debug=1
// and reload, or build with REACT_APP_EZPM2GUI_DEBUG=1, to turn console.log back on.

function isBrowserDebugEnabled(): boolean {
  const fromBuild = (process.env.REACT_APP_EZPM2GUI_DEBUG ?? '').trim().toLowerCase();
  if (fromBuild === '1' || fromBuild === 'true' || fromBuild === 'yes') return true;
  try {
    return window.localStorage.getItem('ezpm2gui-debug') === '1';
  } catch {
    return false;
  }
}

if (!isBrowserDebugEnabled()) {
  console.log = () => {};
}
