/**
 * Open UltraHDR Library
 *
 * TypeScript bindings for the UltraHDR WASM library.
 * Provides detection, encoding, and decoding of UltraHDR JPEG images
 * implementing ISO 21496-1 (gain map) specification.
 *
 * @example
 * ```typescript
 * import { isUltraHdr, decodeUltraHdr, setLocation } from 'open-ultrahdr';
 *
 * // Set the location for WASM files
 * setLocation('/path/to/wasm/');
 *
 * // Check if an image is UltraHDR
 * const buffer = await file.arrayBuffer();
 * if (await isUltraHdr(buffer)) {
 *     const result = await decodeUltraHdr('item-1', buffer);
 *     console.log('HDR headroom:', result.metadata.hdrCapacityMax);
 * }
 * ```
 */

// Re-export types
export type { ItemId, GainMapMetadata, UltraHdrDecodeResult, UltraHdrEncodeOptions, UltraHdrProbeResult } from './types';

export {
	ColorGamut,
	TransferFunction,
	defaultEncodeOptions,
	highQualityEncodeOptions,
	smallSizeEncodeOptions,
} from './types';

import type { ItemId, GainMapMetadata, UltraHdrDecodeResult, UltraHdrEncodeOptions, UltraHdrProbeResult } from './types';

import { defaultEncodeOptions } from './types';

// WASM class types (these are actual classes from the generated WASM bindings)
interface WasmUltraHdrEncodeOptions {
	baseQuality: number;
	gainMapQuality: number;
	targetHdrCapacity: number;
	includeIsoMetadata: boolean;
	includeUltrahdrV1: boolean;
	gainMapScale: number;
}

interface WasmGainMapMetadata {
	version: string;
	baseRenditionIsHdr: boolean;
	gainMapMin: number[];
	gainMapMax: number[];
	gamma: number[];
	offsetSdr: number[];
	offsetHdr: number[];
	hdrCapacityMin: number;
	hdrCapacityMax: number;
}

// WASM module type (these come from the generated WASM bindings)
interface UltraHdrWasmModule {
	default: (moduleOrPath?: string | URL | Response | BufferSource) => Promise<unknown>;
	isUltraHdr: (buffer: Uint8Array) => boolean;
	probeUltraHdr: (buffer: Uint8Array) => UltraHdrProbeResult;
	decodeUltraHdr: (buffer: Uint8Array) => UltraHdrDecodeResult;
	encodeUltraHdr: (
		sdrBuffer: Uint8Array,
		hdrBuffer: Float32Array,
		options: WasmUltraHdrEncodeOptions
	) => Uint8Array;
	extractSdrBase: (buffer: Uint8Array) => Uint8Array;
	getMetadata: (buffer: Uint8Array) => WasmGainMapMetadata;
	createDefaultOptions: () => WasmUltraHdrEncodeOptions;
	createHighQualityOptions: () => WasmUltraHdrEncodeOptions;
	createSmallSizeOptions: () => WasmUltraHdrEncodeOptions;
	createDefaultMetadata: () => WasmGainMapMetadata;
	validateMetadata: (metadata: WasmGainMapMetadata) => boolean;
	estimateHdrHeadroom: (metadata: WasmGainMapMetadata) => number;
	isMeaningfulHdr: (metadata: WasmGainMapMetadata) => boolean;
}

/**
 * Location prefix for WASM files.
 * Set this before calling any other functions.
 */
let location = '';

/**
 * Cached WASM module instance.
 */
let wasmInstance: UltraHdrWasmModule | null = null;

/**
 * Promise for ongoing WASM initialization.
 */
let initPromise: Promise<UltraHdrWasmModule> | null = null;

/**
 * Sets the location/public path for loading WASM files.
 *
 * This must be called before using any other functions when the WASM
 * files are not in the same directory as the JavaScript bundle.
 *
 * @param newLocation - Base URL or path where WASM files are located.
 *
 * @example
 * ```typescript
 * // Set location before any other calls
 * setLocation('/assets/wasm/');
 * ```
 */
export function setLocation(newLocation: string): void {
	location = newLocation;
}

/**
 * Checks if metadata is a WASM class instance (has __wbg_ptr property).
 */
function isWasmMetadataInstance(metadata: unknown): boolean {
	return typeof metadata === 'object' && metadata !== null && '__wbg_ptr' in metadata;
}

/**
 * Converts a plain metadata object to a WASM class instance.
 */
async function toWasmMetadata(metadata: GainMapMetadata): Promise<WasmGainMapMetadata> {
	// If it's already a WASM instance, return as-is
	if (isWasmMetadataInstance(metadata)) {
		return metadata as unknown as WasmGainMapMetadata;
	}

	// Create a new WASM instance and copy properties
	const wasm = await getWasm();
	const wasmMetadata = wasm.createDefaultMetadata();

	wasmMetadata.version = metadata.version;
	wasmMetadata.baseRenditionIsHdr = metadata.baseRenditionIsHdr;
	wasmMetadata.gainMapMin = metadata.gainMapMin;
	wasmMetadata.gainMapMax = metadata.gainMapMax;
	wasmMetadata.gamma = metadata.gamma;
	wasmMetadata.offsetSdr = metadata.offsetSdr;
	wasmMetadata.offsetHdr = metadata.offsetHdr;
	wasmMetadata.hdrCapacityMin = metadata.hdrCapacityMin;
	wasmMetadata.hdrCapacityMax = metadata.hdrCapacityMax;

	return wasmMetadata;
}

/**
 * Gets the WASM module, initializing it if necessary.
 */
async function getWasm(): Promise<UltraHdrWasmModule> {
	if (wasmInstance) {
		return wasmInstance;
	}

	if (initPromise) {
		return initPromise;
	}

	initPromise = (async () => {
		try {
			// Dynamic import of the WASM package
			const UltraHdrWasm = (await import('open-ultrahdr-wasm')) as unknown as UltraHdrWasmModule;

			// Initialize WASM with the location prefix for the .wasm file
			// If location is set, construct the full URL to the WASM file
			if (location) {
				const base = location.endsWith('/') ? location : `${location}/`;
				const wasmPath = base + 'open_ultrahdr_bg.wasm';

				// In Node.js, load the WASM file from the filesystem
				// instead of using fetch which doesn't work with file:// URLs
				if (typeof process !== 'undefined' && process.versions && process.versions.node) {
					const fs = await import('fs');
					const wasmBytes = await fs.promises.readFile(wasmPath);
					await UltraHdrWasm.default(wasmBytes);
				} else {
					// In browser, use the URL directly
					await UltraHdrWasm.default(wasmPath);
				}
			} else {
				// Let the WASM module use its default URL resolution (import.meta.url)
				await UltraHdrWasm.default();
			}

			wasmInstance = UltraHdrWasm as unknown as UltraHdrWasmModule;
			return wasmInstance;
		} catch (err) {
			initPromise = null;
			throw err;
		}
	})();

	return initPromise;
}

/**
 * Checks if a buffer contains an UltraHDR image.
 *
 * This is a fast check that looks for gain map metadata without
 * fully decoding the image.
 *
 * @param buffer - JPEG file contents.
 * @return True if the image contains UltraHDR/gain map data.
 *
 * @example
 * ```typescript
 * const buffer = await file.arrayBuffer();
 * if (await isUltraHdr(buffer)) {
 *     console.log('This is an UltraHDR image!');
 * }
 * ```
 */
export async function isUltraHdr(buffer: ArrayBuffer): Promise<boolean> {
	const wasm = await getWasm();
	return wasm.isUltraHdr(new Uint8Array(buffer));
}

/**
 * Probes an image to check if it's UltraHDR and extracts component information.
 *
 * This function efficiently validates if an image is UltraHDR by checking for
 * required components (primary image, gain map, metadata) without full decoding.
 * Returns structured results useful for batch processing and filtering.
 *
 * Unlike `isUltraHdr`, this function provides detailed information about what
 * was found, making it useful for diagnostics and filtering workflows.
 *
 * @param buffer - Image file contents.
 * @return Probe result with detailed component information.
 *
 * @example
 * ```typescript
 * const buffer = await file.arrayBuffer();
 * const result = await probeUltraHdr(buffer);
 *
 * if (result.isValid) {
 *     console.log('UltraHDR image:', result.width, 'x', result.height);
 *     console.log('HDR capacity:', result.hdrCapacity, 'stops');
 *     console.log('Gain map:', result.gainMapWidth, 'x', result.gainMapHeight);
 * } else {
 *     // Diagnose why it's not a valid UltraHDR
 *     if (!result.hasPrimaryImage) console.log('Not a valid JPEG');
 *     if (!result.hasGainMap) console.log('Missing gain map');
 *     if (!result.hasMetadata) console.log('Missing HDR metadata');
 * }
 * ```
 */
export async function probeUltraHdr(buffer: ArrayBuffer): Promise<UltraHdrProbeResult> {
	const wasm = await getWasm();
	return wasm.probeUltraHdr(new Uint8Array(buffer));
}

/**
 * Decodes an UltraHDR image, extracting all components.
 *
 * @param id     - Unique identifier for this operation (for cancellation).
 * @param buffer - UltraHDR JPEG file contents.
 * @return Decoded result with SDR image, gain map, and metadata.
 *
 * @throws Error if the buffer is not a valid UltraHDR JPEG.
 *
 * @example
 * ```typescript
 * const buffer = await file.arrayBuffer();
 * const result = await decodeUltraHdr('upload-1', buffer);
 *
 * // Access components
 * const sdrBlob = new Blob([result.sdrImage], { type: 'image/jpeg' });
 * console.log('Image size:', result.width, 'x', result.height);
 * console.log('HDR capacity:', result.metadata.hdrCapacityMax);
 * ```
 */
export async function decodeUltraHdr(
	id: ItemId,
	buffer: ArrayBuffer
): Promise<UltraHdrDecodeResult> {
	const wasm = await getWasm();
	return wasm.decodeUltraHdr(new Uint8Array(buffer));
}

/**
 * Encodes an UltraHDR JPEG from SDR and HDR inputs.
 *
 * @param id        - Unique identifier for this operation.
 * @param sdrBuffer - SDR JPEG image bytes.
 * @param hdrBuffer - HDR linear RGB data (Float32Array, 3 values per pixel).
 * @param options   - Encoding options.
 * @return Encoded UltraHDR JPEG as ArrayBuffer.
 *
 * @throws Error if inputs are invalid or dimensions don't match.
 *
 * @example
 * ```typescript
 * const sdrBuffer = await sdrFile.arrayBuffer();
 * const hdrData = await getHdrLinearData(); // Float32Array
 *
 * const ultraHdr = await encodeUltraHdr('encode-1', sdrBuffer, hdrData, {
 *     ...defaultEncodeOptions,
 *     targetHdrCapacity: 4.0,
 * });
 *
 * // Create downloadable file
 * const blob = new Blob([ultraHdr], { type: 'image/jpeg' });
 * ```
 */
export async function encodeUltraHdr(
	id: ItemId,
	sdrBuffer: ArrayBuffer,
	hdrBuffer: ArrayBuffer,
	options?: Partial<UltraHdrEncodeOptions>
): Promise<ArrayBuffer> {
	const wasm = await getWasm();

	// Create a proper WASM options instance
	const wasmOpts = wasm.createDefaultOptions();

	// Apply user-provided options
	const mergedOpts = { ...defaultEncodeOptions, ...options };
	wasmOpts.baseQuality = mergedOpts.baseQuality;
	wasmOpts.gainMapQuality = mergedOpts.gainMapQuality;
	wasmOpts.targetHdrCapacity = mergedOpts.targetHdrCapacity;
	wasmOpts.includeIsoMetadata = mergedOpts.includeIsoMetadata;
	wasmOpts.includeUltrahdrV1 = mergedOpts.includeUltrahdrV1;
	wasmOpts.gainMapScale = mergedOpts.gainMapScale;

	const result = wasm.encodeUltraHdr(
		new Uint8Array(sdrBuffer),
		new Float32Array(hdrBuffer),
		wasmOpts
	);

	// Ensure we return a proper ArrayBuffer (not SharedArrayBuffer)
	return result.buffer.slice(
		result.byteOffset,
		result.byteOffset + result.byteLength
	) as ArrayBuffer;
}

/**
 * Extracts the SDR base image from an UltraHDR JPEG.
 *
 * This produces a standard JPEG that can be displayed on any device,
 * without the gain map metadata. Useful for backwards compatibility.
 *
 * @param buffer - UltraHDR JPEG file contents.
 * @return Standard JPEG without gain map.
 *
 * @example
 * ```typescript
 * const ultraHdrBuffer = await file.arrayBuffer();
 * const sdrBuffer = await extractSdrBase(ultraHdrBuffer);
 *
 * // Use the SDR image for non-HDR displays
 * const blob = new Blob([sdrBuffer], { type: 'image/jpeg' });
 * ```
 */
export async function extractSdrBase(buffer: ArrayBuffer): Promise<ArrayBuffer> {
	const wasm = await getWasm();
	const result = wasm.extractSdrBase(new Uint8Array(buffer));
	// Ensure we return a proper ArrayBuffer (not SharedArrayBuffer)
	return result.buffer.slice(
		result.byteOffset,
		result.byteOffset + result.byteLength
	) as ArrayBuffer;
}

/**
 * Gets gain map metadata from an UltraHDR JPEG.
 *
 * This is faster than `decodeUltraHdr` when you only need the metadata.
 *
 * @param buffer - UltraHDR JPEG file contents.
 * @return Gain map metadata.
 *
 * @throws Error if the buffer doesn't contain gain map metadata.
 *
 * @example
 * ```typescript
 * const metadata = await getMetadata(buffer);
 * console.log('Version:', metadata.version);
 * console.log('HDR headroom:', metadata.hdrCapacityMax, 'stops');
 * ```
 */
export async function getMetadata(buffer: ArrayBuffer): Promise<GainMapMetadata> {
	const wasm = await getWasm();
	return wasm.getMetadata(new Uint8Array(buffer));
}

/**
 * Validates gain map metadata.
 *
 * @param metadata - The metadata to validate.
 * @return True if the metadata is valid.
 */
export async function validateMetadata(metadata: GainMapMetadata): Promise<boolean> {
	const wasm = await getWasm();
	const wasmMetadata = await toWasmMetadata(metadata);
	return wasm.validateMetadata(wasmMetadata);
}

/**
 * Estimates the HDR headroom from metadata.
 *
 * @param metadata - The gain map metadata.
 * @return Maximum additional stops of dynamic range above SDR.
 */
export async function estimateHdrHeadroom(metadata: GainMapMetadata): Promise<number> {
	const wasm = await getWasm();
	const wasmMetadata = await toWasmMetadata(metadata);
	return wasm.estimateHdrHeadroom(wasmMetadata);
}

/**
 * Checks if metadata indicates a meaningful HDR image.
 *
 * @param metadata - The gain map metadata.
 * @return True if the gain map provides significant dynamic range extension.
 */
export async function isMeaningfulHdr(metadata: GainMapMetadata): Promise<boolean> {
	const wasm = await getWasm();
	const wasmMetadata = await toWasmMetadata(metadata);
	return wasm.isMeaningfulHdr(wasmMetadata);
}
