import assert from 'assert/strict';
import { getSocketUrl } from '../../src/client/src/utils/socket-url';

const originalApiUrl = process.env.REACT_APP_API_URL;
const originalNodeEnv = process.env.NODE_ENV;

const restoreEnv = () => {
  if (originalApiUrl === undefined) {
    delete process.env.REACT_APP_API_URL;
  } else {
    process.env.REACT_APP_API_URL = originalApiUrl;
  }
  process.env.NODE_ENV = originalNodeEnv;
};

try {
  process.env.REACT_APP_API_URL = 'http://custom-host:3999';
  process.env.NODE_ENV = 'production';
  assert.equal(getSocketUrl('https://ignored.example'), 'http://custom-host:3999');

  delete process.env.REACT_APP_API_URL;
  process.env.NODE_ENV = 'development';
  assert.equal(getSocketUrl(), 'http://localhost:3101');

  process.env.NODE_ENV = 'production';
  assert.equal(getSocketUrl('https://pm2.example:3101'), 'https://pm2.example:3101');
  assert.equal(getSocketUrl(), undefined);

  console.log('socket-url tests passed');
} finally {
  restoreEnv();
}
