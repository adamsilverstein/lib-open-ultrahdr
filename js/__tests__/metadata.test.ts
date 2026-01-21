/**
 * Metadata function tests.
 */
import { describe, it, expect } from 'vitest';
import { validateMetadata, estimateHdrHeadroom, isMeaningfulHdr } from '../src/index';
import type { GainMapMetadata } from '../src/types';

describe('validateMetadata', () => {
	it('returns true for valid default metadata', async () => {
		const validMetadata: GainMapMetadata = {
			version: '1.0',
			baseRenditionIsHdr: false,
			gainMapMin: [0.0, 0.0, 0.0],
			gainMapMax: [1.0, 1.0, 1.0],
			gamma: [1.0, 1.0, 1.0],
			offsetSdr: [0.0, 0.0, 0.0],
			offsetHdr: [0.0, 0.0, 0.0],
			hdrCapacityMin: 0.0,
			hdrCapacityMax: 3.0,
		};

		const result = await validateMetadata(validMetadata);
		expect(result).toBe(true);
	});

	it('returns false for metadata with invalid arrays', async () => {
		const invalidMetadata: GainMapMetadata = {
			version: '1.0',
			baseRenditionIsHdr: false,
			gainMapMin: [0.0, 0.0], // Should have 3 elements
			gainMapMax: [1.0, 1.0, 1.0],
			gamma: [1.0, 1.0, 1.0],
			offsetSdr: [0.0, 0.0, 0.0],
			offsetHdr: [0.0, 0.0, 0.0],
			hdrCapacityMin: 0.0,
			hdrCapacityMax: 3.0,
		};

		const result = await validateMetadata(invalidMetadata);
		expect(result).toBe(false);
	});

	it('returns false for metadata with negative gamma', async () => {
		const invalidMetadata: GainMapMetadata = {
			version: '1.0',
			baseRenditionIsHdr: false,
			gainMapMin: [0.0, 0.0, 0.0],
			gainMapMax: [1.0, 1.0, 1.0],
			gamma: [-1.0, 1.0, 1.0], // Gamma should be positive
			offsetSdr: [0.0, 0.0, 0.0],
			offsetHdr: [0.0, 0.0, 0.0],
			hdrCapacityMin: 0.0,
			hdrCapacityMax: 3.0,
		};

		const result = await validateMetadata(invalidMetadata);
		expect(result).toBe(false);
	});
});

describe('estimateHdrHeadroom', () => {
	it('returns positive value for typical HDR metadata', async () => {
		const metadata: GainMapMetadata = {
			version: '1.0',
			baseRenditionIsHdr: false,
			gainMapMin: [0.0, 0.0, 0.0],
			gainMapMax: [2.0, 2.0, 2.0],
			gamma: [1.0, 1.0, 1.0],
			offsetSdr: [0.0, 0.0, 0.0],
			offsetHdr: [0.0, 0.0, 0.0],
			hdrCapacityMin: 0.0,
			hdrCapacityMax: 3.0,
		};

		const headroom = await estimateHdrHeadroom(metadata);
		expect(headroom).toBeGreaterThan(0);
	});

	it('returns hdrCapacityMax value', async () => {
		const metadata: GainMapMetadata = {
			version: '1.0',
			baseRenditionIsHdr: false,
			gainMapMin: [0.0, 0.0, 0.0],
			gainMapMax: [1.0, 1.0, 1.0],
			gamma: [1.0, 1.0, 1.0],
			offsetSdr: [0.0, 0.0, 0.0],
			offsetHdr: [0.0, 0.0, 0.0],
			hdrCapacityMin: 0.0,
			hdrCapacityMax: 4.0,
		};

		const headroom = await estimateHdrHeadroom(metadata);
		expect(headroom).toBeCloseTo(4.0, 1);
	});
});

describe('isMeaningfulHdr', () => {
	it('returns true for metadata with significant HDR capacity', async () => {
		const metadata: GainMapMetadata = {
			version: '1.0',
			baseRenditionIsHdr: false,
			gainMapMin: [0.0, 0.0, 0.0],
			gainMapMax: [2.0, 2.0, 2.0],
			gamma: [1.0, 1.0, 1.0],
			offsetSdr: [0.0, 0.0, 0.0],
			offsetHdr: [0.0, 0.0, 0.0],
			hdrCapacityMin: 0.0,
			hdrCapacityMax: 3.0,
		};

		const result = await isMeaningfulHdr(metadata);
		expect(result).toBe(true);
	});

	it('returns false for metadata with minimal HDR capacity', async () => {
		const metadata: GainMapMetadata = {
			version: '1.0',
			baseRenditionIsHdr: false,
			gainMapMin: [0.0, 0.0, 0.0],
			gainMapMax: [0.1, 0.1, 0.1], // Very small gain
			gamma: [1.0, 1.0, 1.0],
			offsetSdr: [0.0, 0.0, 0.0],
			offsetHdr: [0.0, 0.0, 0.0],
			hdrCapacityMin: 0.0,
			hdrCapacityMax: 0.2, // Less than 0.5 stops
		};

		const result = await isMeaningfulHdr(metadata);
		expect(result).toBe(false);
	});
});
