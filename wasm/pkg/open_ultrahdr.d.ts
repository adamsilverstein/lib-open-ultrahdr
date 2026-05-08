/**
 * Type declarations for the Emscripten/embind-built libultrahdr WASM module.
 *
 * The module is produced by Emscripten with MODULARIZE=1 + EXPORT_ES6=1,
 * exposing a default-export factory that returns a Promise resolving to the
 * populated module. Embind populates the function and value-object surface
 * directly on the resolved Module instance.
 *
 * Metadata at this boundary is in *log2 stops* (e.g. `hdrCapacityMax = 3.0`
 * means 3 stops above SDR diffuse white). The embind layer converts to/from
 * libultrahdr's linear scale internally.
 */

export interface UltraHdrEncodeOptions {
	baseQuality: number;
	gainMapQuality: number;
	targetHdrCapacity: number;
	includeIsoMetadata: boolean;
	includeUltrahdrV1: boolean;
	gainMapScale: number;
}

export interface GainMapMetadata {
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

export interface UltraHdrProbeResult {
	isValid: boolean;
	hasPrimaryImage: boolean;
	hasGainMap: boolean;
	hasMetadata: boolean;
	width: number;
	height: number;
	gainMapWidth: number;
	gainMapHeight: number;
	hdrCapacity: number;
	metadataVersion: string;
}

export interface UltraHdrDecodeResult {
	sdrImage: Uint8Array;
	gainMap: Uint8Array;
	metadata: GainMapMetadata;
	width: number;
	height: number;
	gainMapWidth: number;
	gainMapHeight: number;
}

/** Options accepted by the module factory. */
export interface OpenUltraHdrModuleOptions {
	/**
	 * Resolve URLs for files (typically the .wasm) loaded by the module at
	 * runtime. Mirrors Emscripten's standard `locateFile` hook.
	 */
	locateFile?: (path: string, scriptDirectory: string) => string;
	wasmBinary?: ArrayBuffer | Uint8Array;
	[key: string]: unknown;
}

/** Populated module instance after the factory promise resolves. */
export interface OpenUltraHdrModule {
	isUltraHdr(buffer: Uint8Array): boolean;
	probeUltraHdr(buffer: Uint8Array): UltraHdrProbeResult;
	decodeUltraHdr(buffer: Uint8Array): UltraHdrDecodeResult;
	encodeUltraHdr(
		sdrBuffer: Uint8Array,
		hdrBuffer: Float32Array,
		options: UltraHdrEncodeOptions
	): Uint8Array;
	extractSdrBase(buffer: Uint8Array): Uint8Array;
	getMetadata(buffer: Uint8Array): GainMapMetadata;
	createDefaultOptions(): UltraHdrEncodeOptions;
	createHighQualityOptions(): UltraHdrEncodeOptions;
	createSmallSizeOptions(): UltraHdrEncodeOptions;
	createDefaultMetadata(): GainMapMetadata;
	validateMetadata(metadata: GainMapMetadata): boolean;
	estimateHdrHeadroom(metadata: GainMapMetadata): number;
	isMeaningfulHdr(metadata: GainMapMetadata): boolean;
}

declare const createOpenUltraHdrModule: (
	options?: OpenUltraHdrModuleOptions
) => Promise<OpenUltraHdrModule>;

export default createOpenUltraHdrModule;
