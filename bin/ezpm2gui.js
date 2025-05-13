#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Determine the path to the server executable
const serverPath = path_1.default.join(__dirname, '../dist/server/index.js');
// Check if the server file exists
if (!fs_1.default.existsSync(serverPath)) {
    console.error('Error: Server executable not found. Please make sure the package is built correctly.');
    process.exit(1);
}
// Start the server
const server = (0, child_process_1.spawn)('node', [serverPath], { stdio: 'inherit' });
// Log startup message
console.log('\x1b[36m%s\x1b[0m', `
╔════════════════════════════════════╗
║          ezPM2GUI Started          ║
╚════════════════════════════════════╝

Web interface available at: \x1b[1mhttp://localhost:3001\x1b[0m

Press Ctrl+C to stop the server.
`);
// Handle server process events
server.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
server.on('exit', (code) => {
    if (code !== 0) {
        console.error(`Server process exited with code ${code}`);
    }
    process.exit(code || 0);
});
// Handle termination signals
process.on('SIGINT', () => {
    console.log('\nShutting down ezPM2GUI...');
    server.kill();
});
process.on('SIGTERM', () => {
    console.log('\nShutting down ezPM2GUI...');
    server.kill();
});
