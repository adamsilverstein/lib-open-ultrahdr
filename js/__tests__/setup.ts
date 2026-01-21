/**
 * Vitest setup file for e2e tests.
 *
 * Initializes the WASM module before tests run.
 */
import { beforeAll } from 'vitest';
import { setLocation } from '../src/index';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

beforeAll(async () => {
	// Set the WASM location to the local pkg directory
	const wasmPath = resolve(__dirname, '../../wasm/pkg/');
	setLocation(`file://${wasmPath}/`);
});
