import { RemoteConnection } from '../types/remote';

// @group Constants : Active server selection keys
export const LOCAL_SERVER_ID = 'local';
export const ACTIVE_SERVER_STORAGE_KEY = 'ezpm2gui-active-server';
export const REMOTE_CONNECTIONS_CHANGED_EVENT = 'ezpm2gui-remote-connections-changed';

// @group Utilities : Active server availability helpers
export function isRemoteServerAvailable(
  serverId: string,
  connections: Pick<RemoteConnection, 'id'>[]
): boolean {
  if (serverId === LOCAL_SERVER_ID) return true;
  return connections.some(connection => connection.id === serverId);
}

export function resolveAvailableServerId(
  serverId: string,
  connections: Pick<RemoteConnection, 'id'>[]
): string {
  return isRemoteServerAvailable(serverId, connections) ? serverId : LOCAL_SERVER_ID;
}
