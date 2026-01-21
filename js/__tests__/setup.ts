/**
 * Vitest setup file for e2e tests.
 *
 * Initializes the WASM module before tests run by loading the binary directly.
 */
import { beforeAll } from 'vitest';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

beforeAll(async () => {
	// Load WASM bytes directly using Node.js fs
	const wasmPath = resolve(__dirname, '../../wasm/pkg/open_ultrahdr_bg.wasm');
	const wasmBytes = await readFile(wasmPath);

	// Import and initialize the WASM module with the bytes
	const wasmModule = await import('../../wasm/pkg/open_ultrahdr.js');
	await wasmModule.default(wasmBytes);
});
