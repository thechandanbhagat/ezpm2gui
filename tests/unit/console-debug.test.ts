import assert from 'assert/strict';
import { applyServerConsolePolicy, isConsoleDebugEnabled } from '../../src/server/utils/console-debug';

assert.equal(isConsoleDebugEnabled({}), false);
assert.equal(isConsoleDebugEnabled({ EZPM2GUI_DEBUG: '' }), false);
assert.equal(isConsoleDebugEnabled({ EZPM2GUI_DEBUG: '0' }), false);
assert.equal(isConsoleDebugEnabled({ EZPM2GUI_DEBUG: ' 1 ' }), true);
assert.equal(isConsoleDebugEnabled({ EZPM2GUI_DEBUG: 'true' }), true);
assert.equal(isConsoleDebugEnabled({ EZPM2GUI_DEBUG: 'YES' }), true);

const original = console.log;
let calls = 0;
console.log = () => {
  calls += 1;
};
try {
  applyServerConsolePolicy({ EZPM2GUI_DEBUG: '1' });
  console.log('shown');
  assert.equal(calls, 1);

  applyServerConsolePolicy({});
  console.log('hidden');
  assert.equal(calls, 1);
} finally {
  console.log = original;
}

console.log('console-debug tests passed');
