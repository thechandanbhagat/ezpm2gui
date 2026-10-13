import { beforeEach, expect, jest, test } from '@jest/globals';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

jest.doMock('http-proxy', () => {
  const { EventEmitter } = require('events');
  return {
    createProxyServer: jest.fn(() => Object.assign(new EventEmitter(), {
      web: jest.fn(), ws: jest.fn(), close: jest.fn(),
    })),
  };
});

jest.spyOn(console, 'info').mockImplementation(() => {});
const configureProxy = require('./setupProxy');
const { createProxyServer } = require('http-proxy');
type Middleware = {
  upgrade: (request: IncomingMessage, socket: Socket, head: Buffer) => void;
};
const FLUSH_COUNT = 10;

beforeEach(() => {
  createProxyServer.mockImplementation(() => {
    const { EventEmitter } = require('events');
    return Object.assign(new EventEmitter(), { web: jest.fn(), ws: jest.fn(), close: jest.fn() });
  });
});

async function upgrade(path: string): Promise<ReturnType<typeof jest.fn>> {
  const middlewares: Middleware[] = [];
  configureProxy({ use: (_path: string, middleware: Middleware) => middlewares.push(middleware) });
  const backendProxy = createProxyServer.mock.results[createProxyServer.mock.results.length - 1].value;
  const request = { url: path, headers: { host: 'localhost:3100' } } as IncomingMessage;
  middlewares[middlewares.length - 1].upgrade(request, {} as Socket, Buffer.alloc(0));
  for (let index = 0; index < FLUSH_COUNT; index += 1) await Promise.resolve();
  return backendProxy.ws;
}

test('leaves the development hot-reload WebSocket with webpack-dev-server', async () => {
  expect(await upgrade('/ws')).not.toHaveBeenCalled();
});

test.each(['/socket.io', '/socket.io/?EIO=4&transport=websocket'])('forwards the application WebSocket %s', async path => {
  expect(await upgrade(path)).toHaveBeenCalledTimes(1);
});

test.each(['/api/processes', '/socket.io-other', '/'])('does not claim unrelated upgrade %s', async path => {
  expect(await upgrade(path)).not.toHaveBeenCalled();
});
