/**
 * Vitest setup file for e2e tests.
 *
 * Initializes the WASM module before tests run by setting the location
 * to coordinate with the library's initialization.
 */
import { beforeAll } from 'vitest';
import { setLocation } from '../src/index';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

beforeAll(async () => {
	// Set the WASM location to coordinate with the library's getWasm() initialization
	const wasmPath = resolve(__dirname, '../../wasm/pkg/');
	setLocation(wasmPath);
});
