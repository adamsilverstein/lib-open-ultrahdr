/**
 * Open UltraHDR Library
 *
 * TypeScript bindings for the libultrahdr WASM library. Provides detection,
 * encoding, and decoding of UltraHDR JPEG images implementing the
 * ISO 21496-1 (gain map) specification.
 *
 * Backed by upstream `libultrahdr` compiled to WebAssembly via Emscripten/embind.
 *
 * @example
 * ```typescript
 * import { isUltraHdr, decodeUltraHdr, setLocation } from 'open-ultrahdr';
 *
 * setLocation('/path/to/wasm/');
 *
 * const buffer = await file.arrayBuffer();
 * if (await isUltraHdr(buffer)) {
 *     const result = await decodeUltraHdr('item-1', buffer);
 *     console.log('HDR headroom:', result.metadata.hdrCapacityMax);
 * }
 * ```
 */

export type {
	ItemId,
	GainMapMetadata,
	UltraHdrDecodeResult,
	UltraHdrEncodeOptions,
	UltraHdrProbeResult,
} from './types';

export {
	ColorGamut,
	TransferFunction,
	defaultEncodeOptions,
	highQualityEncodeOptions,
	smallSizeEncodeOptions,
} from './types';

import type {
	ItemId,
	GainMapMetadata,
	UltraHdrDecodeResult,
	UltraHdrEncodeOptions,
	UltraHdrProbeResult,
} from './types';

import { defaultEncodeOptions } from './types';

import type { OpenUltraHdrModule } from 'open-ultrahdr-wasm';

const WASM_FILENAME = 'open_ultrahdr.wasm';

let location = '';
let explicitWasmUrl: string | null = null;
let wasmInstance: OpenUltraHdrModule | null = null;
let initPromise: Promise<OpenUltraHdrModule> | null = null;

/**
 * Sets the location/public path for loading WASM files.
 *
 * Must be called before using any other functions when the WASM file is not
 * served from the same directory as the JavaScript bundle.
 *
 * @param newLocation - Base URL or path where WASM files are located.
 */
export function setLocation(newLocation: string): void {
	location = newLocation;
	explicitWasmUrl = null;
	resetCache();
}

/**
 * Sets an explicit URL (or `data:` URL) for the WASM file.
 *
 * Useful when bundling the WASM as a base64 data URL.
 *
 * @param url - Full URL or data URL pointing to `open_ultrahdr.wasm`.
 */
export function setWasmUrl(url: string): void {
	explicitWasmUrl = url;
	resetCache();
}

function resetCache(): void {
	wasmInstance = null;
	initPromise = null;
}

function joinPath(base: string, name: string): string {
	if (!base) return name;
	return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
}

async function getWasm(): Promise<OpenUltraHdrModule> {
	if (wasmInstance) return wasmInstance;
	if (initPromise) return initPromise;

	initPromise = (async () => {
		try {
			const wasmModule = await import('open-ultrahdr-wasm');
			const factory = (wasmModule as unknown as { default: typeof wasmModule.default }).default;

			const isNode =
				typeof process !== 'undefined' && !!process.versions && !!process.versions.node;

			const moduleOptions: { locateFile?: (path: string) => string; wasmBinary?: Uint8Array } = {};

			if (explicitWasmUrl) {
				moduleOptions.locateFile = (path: string) =>
					path.endsWith('.wasm') ? explicitWasmUrl! : path;
			} else if (location) {
				if (isNode) {
					// In Node, sidestep fetch entirely and provide the bytes directly.
					const fs = await import('node:fs');
					const wasmBytes = await fs.promises.readFile(joinPath(location, WASM_FILENAME));
					moduleOptions.wasmBinary = new Uint8Array(wasmBytes);
				} else {
					moduleOptions.locateFile = (path: string) =>
						path.endsWith('.wasm') ? joinPath(location, WASM_FILENAME) : path;
				}
			}

			const instance = (await factory(moduleOptions)) as unknown as OpenUltraHdrModule;
			wasmInstance = instance;
			return instance;
		} catch (err) {
			initPromise = null;
			throw err;
		}
	})();

	return initPromise;
}

/**
 * Checks if a buffer contains an UltraHDR image.
 */
export async function isUltraHdr(buffer: ArrayBuffer): Promise<boolean> {
	const wasm = await getWasm();
	return wasm.isUltraHdr(new Uint8Array(buffer));
}

/**
 * Probes an image to check if it's UltraHDR and extracts component info.
 *
 * Never throws — invalid inputs return a result with all flags set to false.
 */
export async function probeUltraHdr(buffer: ArrayBuffer): Promise<UltraHdrProbeResult> {
	const wasm = await getWasm();
	try {
		return wasm.probeUltraHdr(new Uint8Array(buffer));
	} catch {
		return {
			isValid: false,
			hasPrimaryImage: false,
			hasGainMap: false,
			hasMetadata: false,
			width: 0,
			height: 0,
			gainMapWidth: 0,
			gainMapHeight: 0,
			hdrCapacity: 0,
			metadataVersion: '',
		};
	}
}

/**
 * Decodes an UltraHDR image, extracting all components.
 */
export async function decodeUltraHdr(
	_id: ItemId,
	buffer: ArrayBuffer
): Promise<UltraHdrDecodeResult> {
	const wasm = await getWasm();
	return wasm.decodeUltraHdr(new Uint8Array(buffer));
}

/**
 * Encodes an UltraHDR JPEG from SDR and HDR inputs.
 */
export async function encodeUltraHdr(
	_id: ItemId,
	sdrBuffer: ArrayBuffer,
	hdrBuffer: ArrayBuffer,
	options?: Partial<UltraHdrEncodeOptions>
): Promise<ArrayBuffer> {
	const wasm = await getWasm();
	const merged: UltraHdrEncodeOptions = { ...defaultEncodeOptions, ...options };
	const result = wasm.encodeUltraHdr(
		new Uint8Array(sdrBuffer),
		new Float32Array(hdrBuffer),
		merged
	);
	return result.buffer.slice(
		result.byteOffset,
		result.byteOffset + result.byteLength
	) as ArrayBuffer;
}

/**
 * Extracts the SDR base image from an UltraHDR JPEG.
 */
export async function extractSdrBase(buffer: ArrayBuffer): Promise<ArrayBuffer> {
	const wasm = await getWasm();
	const result = wasm.extractSdrBase(new Uint8Array(buffer));
	return result.buffer.slice(
		result.byteOffset,
		result.byteOffset + result.byteLength
	) as ArrayBuffer;
}

/**
 * Gets gain map metadata from an UltraHDR JPEG.
 */
export async function getMetadata(buffer: ArrayBuffer): Promise<GainMapMetadata> {
	const wasm = await getWasm();
	return wasm.getMetadata(new Uint8Array(buffer));
}

/**
 * Validates gain map metadata.
 */
export async function validateMetadata(metadata: GainMapMetadata): Promise<boolean> {
	const wasm = await getWasm();
	return wasm.validateMetadata(metadata);
}

/**
 * Estimates the HDR headroom from metadata.
 */
export async function estimateHdrHeadroom(metadata: GainMapMetadata): Promise<number> {
	const wasm = await getWasm();
	return wasm.estimateHdrHeadroom(metadata);
}

/**
 * Checks if metadata indicates a meaningful HDR image.
 */
export async function isMeaningfulHdr(metadata: GainMapMetadata): Promise<boolean> {
	const wasm = await getWasm();
	return wasm.isMeaningfulHdr(metadata);
}
