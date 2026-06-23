import assert from 'assert/strict';
import {
  LOCAL_SERVER_ID,
  isRemoteServerAvailable,
  resolveAvailableServerId,
} from '../../src/client/src/utils/server-selection';

// @group TestSetup : Active server sample data
const remoteConnections = [
  { id: 'remote-a' },
  { id: 'remote-b' },
];

// @group UnitTests : Active server fallback rules
assert.equal(isRemoteServerAvailable(LOCAL_SERVER_ID, []), true);
assert.equal(isRemoteServerAvailable('remote-a', remoteConnections), true);
assert.equal(resolveAvailableServerId('remote-b', remoteConnections), 'remote-b');

// @group EdgeCases : Missing and empty connection lists
assert.equal(isRemoteServerAvailable('deleted-remote', remoteConnections), false);
assert.equal(resolveAvailableServerId('deleted-remote', remoteConnections), LOCAL_SERVER_ID);
assert.equal(resolveAvailableServerId('remote-a', []), LOCAL_SERVER_ID);

console.log('server-selection tests passed');
