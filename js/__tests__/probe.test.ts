/**
 * Probe tests for probeUltraHdr function.
 */
import { describe, it, expect } from 'vitest';
import { probeUltraHdr } from '../src/index';
import { base64ToArrayBuffer, REGULAR_JPEG_BASE64, PNG_HEADER_BASE64 } from './fixtures/test-data';

describe('probeUltraHdr', () => {
	it('returns invalid result with all flags false for empty buffer', async () => {
		const emptyBuffer = new ArrayBuffer(0);
		const result = await probeUltraHdr(emptyBuffer);

		expect(result.isValid).toBe(false);
		expect(result.hasPrimaryImage).toBe(false);
		expect(result.hasGainMap).toBe(false);
		expect(result.hasMetadata).toBe(false);
		expect(result.width).toBe(0);
		expect(result.height).toBe(0);
		expect(result.gainMapWidth).toBe(0);
		expect(result.gainMapHeight).toBe(0);
		expect(result.hdrCapacity).toBe(0);
		expect(result.metadataVersion).toBe('');
	});

	it('returns invalid result for PNG file (not JPEG)', async () => {
		const pngBuffer = base64ToArrayBuffer(PNG_HEADER_BASE64);
		const result = await probeUltraHdr(pngBuffer);

		expect(result.isValid).toBe(false);
		expect(result.hasPrimaryImage).toBe(false);
		expect(result.hasGainMap).toBe(false);
		expect(result.hasMetadata).toBe(false);
	});

	it('returns invalid result for regular JPEG (missing gain map and metadata)', async () => {
		const jpegBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const result = await probeUltraHdr(jpegBuffer);

		expect(result.isValid).toBe(false);
		expect(result.hasPrimaryImage).toBe(true); // It IS a valid JPEG
		expect(result.hasGainMap).toBe(false); // But no gain map
		expect(result.hasMetadata).toBe(false); // And no metadata
	});

	it('provides failure reasons through structured result', async () => {
		const jpegBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const result = await probeUltraHdr(jpegBuffer);

		// Can use the result to diagnose why it's not valid
		const reasons: string[] = [];
		if (!result.hasPrimaryImage) reasons.push('Not a JPEG');
		if (!result.hasGainMap) reasons.push('Missing gain map');
		if (!result.hasMetadata) reasons.push('Missing HDR metadata');

		expect(reasons).toContain('Missing gain map');
		expect(reasons).toContain('Missing HDR metadata');
		expect(reasons).not.toContain('Not a JPEG');
	});

	it('returns dimensions when image is a valid JPEG', async () => {
		const jpegBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const result = await probeUltraHdr(jpegBuffer);

		// The test JPEG is 2x2 pixels
		expect(result.width).toBe(2);
		expect(result.height).toBe(2);
	});

	it('never throws, always returns a result', async () => {
		// Test with various invalid inputs
		const testCases = [
			new ArrayBuffer(0), // Empty
			new ArrayBuffer(1), // Single byte
			new ArrayBuffer(2), // Two bytes
			base64ToArrayBuffer(PNG_HEADER_BASE64), // PNG
			base64ToArrayBuffer(REGULAR_JPEG_BASE64), // Regular JPEG
			new Uint8Array([0xff, 0xd8, 0xff]).buffer, // Truncated JPEG
			new Uint8Array([0x00, 0x00, 0x00, 0x00]).buffer, // Random bytes
		];

		for (const buffer of testCases) {
			// Should never throw
			const result = await probeUltraHdr(buffer);

			// Should always return a valid result object
			expect(result).toBeDefined();
			expect(typeof result.isValid).toBe('boolean');
			expect(typeof result.hasPrimaryImage).toBe('boolean');
			expect(typeof result.hasGainMap).toBe('boolean');
			expect(typeof result.hasMetadata).toBe('boolean');
			expect(typeof result.width).toBe('number');
			expect(typeof result.height).toBe('number');
			expect(typeof result.gainMapWidth).toBe('number');
			expect(typeof result.gainMapHeight).toBe('number');
			expect(typeof result.hdrCapacity).toBe('number');
			expect(typeof result.metadataVersion).toBe('string');
		}
	});

	it('handles random bytes gracefully', async () => {
		const randomBuffer = new ArrayBuffer(1000);
		const view = new Uint8Array(randomBuffer);
		for (let i = 0; i < view.length; i++) {
			view[i] = (i * 31) & 0xff;
		}

		const result = await probeUltraHdr(randomBuffer);

		expect(result.isValid).toBe(false);
		expect(result.hasPrimaryImage).toBe(false);
	});

	it('handles very small buffers gracefully', async () => {
		const tinyBuffer = new ArrayBuffer(2);
		const result = await probeUltraHdr(tinyBuffer);

		expect(result.isValid).toBe(false);
		expect(result.hasPrimaryImage).toBe(false);
	});

	it('gain map dimensions are 0 when no gain map is present', async () => {
		const jpegBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const result = await probeUltraHdr(jpegBuffer);

		expect(result.hasGainMap).toBe(false);
		expect(result.gainMapWidth).toBe(0);
		expect(result.gainMapHeight).toBe(0);
	});

	it('hdr capacity is 0 when no metadata is present', async () => {
		const jpegBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const result = await probeUltraHdr(jpegBuffer);

		expect(result.hasMetadata).toBe(false);
		expect(result.hdrCapacity).toBe(0);
	});

	it('metadata version is empty when no metadata is present', async () => {
		const jpegBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const result = await probeUltraHdr(jpegBuffer);

		expect(result.hasMetadata).toBe(false);
		expect(result.metadataVersion).toBe('');
	});
});
