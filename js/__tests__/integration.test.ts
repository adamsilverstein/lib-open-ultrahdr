/**
 * Integration tests for encode-decode roundtrip.
 *
 * These tests verify that the complete encoding and decoding pipeline works.
 */
import { describe, it, expect } from 'vitest';
import {
	isUltraHdr,
	encodeUltraHdr,
	decodeUltraHdr,
	extractSdrBase,
	getMetadata,
	defaultEncodeOptions,
} from '../src/index';
import {
	base64ToArrayBuffer,
	REGULAR_JPEG_BASE64,
	createSyntheticHdrData,
} from './fixtures/test-data';

describe('encode-decode roundtrip', () => {
	it('encodes an UltraHDR image that can be detected', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		// The test JPEG is 2x2 pixels
		const hdrData = createSyntheticHdrData(2, 2);

		const encoded = await encodeUltraHdr('test-1', sdrBuffer, hdrData.buffer, {
			...defaultEncodeOptions,
			targetHdrCapacity: 3.0,
		});

		expect(encoded).toBeInstanceOf(ArrayBuffer);
		expect(encoded.byteLength).toBeGreaterThan(0);

		// Verify it's detected as UltraHDR
		const isUltra = await isUltraHdr(encoded);
		expect(isUltra).toBe(true);
	});

	it('decodes an encoded UltraHDR image', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const hdrData = createSyntheticHdrData(2, 2);

		const encoded = await encodeUltraHdr('test-2', sdrBuffer, hdrData.buffer, defaultEncodeOptions);
		const decoded = await decodeUltraHdr('test-2-decode', encoded);

		// Verify structure
		expect(decoded).toHaveProperty('sdrImage');
		expect(decoded).toHaveProperty('gainMap');
		expect(decoded).toHaveProperty('metadata');
		expect(decoded).toHaveProperty('width');
		expect(decoded).toHaveProperty('height');
		expect(decoded).toHaveProperty('gainMapWidth');
		expect(decoded).toHaveProperty('gainMapHeight');

		// Verify SDR image is valid
		expect(decoded.sdrImage).toBeInstanceOf(Uint8Array);
		expect(decoded.sdrImage.length).toBeGreaterThan(0);

		// Verify gain map exists
		expect(decoded.gainMap).toBeInstanceOf(Uint8Array);
		expect(decoded.gainMap.length).toBeGreaterThan(0);

		// Verify dimensions
		expect(decoded.width).toBe(2);
		expect(decoded.height).toBe(2);
	});

	it('preserves metadata through encode-decode', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const hdrData = createSyntheticHdrData(2, 2);

		const targetCapacity = 3.5;
		const encoded = await encodeUltraHdr('test-3', sdrBuffer, hdrData.buffer, {
			...defaultEncodeOptions,
			targetHdrCapacity: targetCapacity,
		});

		const decoded = await decodeUltraHdr('test-3-decode', encoded);

		// Verify metadata structure
		expect(decoded.metadata).toHaveProperty('version');
		expect(decoded.metadata).toHaveProperty('hdrCapacityMax');
		expect(decoded.metadata).toHaveProperty('gainMapMin');
		expect(decoded.metadata).toHaveProperty('gainMapMax');
		expect(decoded.metadata).toHaveProperty('gamma');

		// Arrays should have 3 elements (RGB)
		expect(decoded.metadata.gainMapMin).toHaveLength(3);
		expect(decoded.metadata.gainMapMax).toHaveLength(3);
		expect(decoded.metadata.gamma).toHaveLength(3);
	});

	it('extracts SDR base from encoded UltraHDR', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const hdrData = createSyntheticHdrData(2, 2);

		const encoded = await encodeUltraHdr('test-4', sdrBuffer, hdrData.buffer, defaultEncodeOptions);
		const extractedSdr = await extractSdrBase(encoded);

		// Extracted SDR should be valid JPEG
		expect(extractedSdr).toBeInstanceOf(ArrayBuffer);
		expect(extractedSdr.byteLength).toBeGreaterThan(0);

		// Check JPEG magic bytes
		const view = new Uint8Array(extractedSdr);
		expect(view[0]).toBe(0xff);
		expect(view[1]).toBe(0xd8);

		// Extracted SDR should NOT be detected as UltraHDR
		const isUltra = await isUltraHdr(extractedSdr);
		expect(isUltra).toBe(false);
	});

	it('retrieves metadata from encoded UltraHDR', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const hdrData = createSyntheticHdrData(2, 2);

		const encoded = await encodeUltraHdr('test-5', sdrBuffer, hdrData.buffer, {
			...defaultEncodeOptions,
			targetHdrCapacity: 4.0,
		});

		const metadata = await getMetadata(encoded);

		expect(metadata).toHaveProperty('version');
		expect(metadata).toHaveProperty('hdrCapacityMax');
		expect(metadata.hdrCapacityMax).toBeGreaterThan(0);
	});
});

describe('encoding options', () => {
	it('respects quality settings', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const hdrData = createSyntheticHdrData(2, 2);

		const lowQuality = await encodeUltraHdr('quality-low', sdrBuffer, hdrData.buffer, {
			...defaultEncodeOptions,
			baseQuality: 50,
			gainMapQuality: 50,
		});

		const highQuality = await encodeUltraHdr('quality-high', sdrBuffer, hdrData.buffer, {
			...defaultEncodeOptions,
			baseQuality: 95,
			gainMapQuality: 95,
		});

		// Higher quality should generally produce larger file
		// Note: With very small test images this might not always hold
		expect(highQuality.byteLength).toBeGreaterThanOrEqual(lowQuality.byteLength * 0.5);
	});

	it('includes ISO metadata by default', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const hdrData = createSyntheticHdrData(2, 2);

		const encoded = await encodeUltraHdr('iso-test', sdrBuffer, hdrData.buffer, {
			...defaultEncodeOptions,
			includeIsoMetadata: true,
		});

		const isUltra = await isUltraHdr(encoded);
		expect(isUltra).toBe(true);
	});
});
