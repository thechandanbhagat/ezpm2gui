import path from 'path';
import { applyServerConsolePolicy } from './console-debug';

// Load env before other server modules import, then drop console.log noise.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

applyServerConsolePolicy();
