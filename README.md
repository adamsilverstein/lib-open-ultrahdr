# Open UltraHDR

A GPLv2-compatible implementation of UltraHDR (ISO 21496-1) gain map specification for JavaScript/TypeScript applications.

## Features

- **Detection**: Check if a JPEG contains UltraHDR/gain map data
- **Decoding**: Extract SDR base, gain map, and metadata from UltraHDR JPEGs
- **Encoding**: Create UltraHDR JPEGs from SDR + HDR image pairs
- **SDR Extraction**: Extract backwards-compatible SDR image

## Standards Support

- ISO 21496-1:2025 (Gain map metadata)
- Google UltraHDR v1 (Android compatibility)
- Adobe Gain Map specification

## Installation

```bash
npm install open-ultrahdr
```

## Usage

### Check if an image is UltraHDR

```typescript
import { isUltraHdr, setLocation } from 'open-ultrahdr';

// Set the location of WASM files (required if not co-located with JS)
setLocation('/path/to/wasm/');

const buffer = await file.arrayBuffer();
if (await isUltraHdr(buffer)) {
    console.log('This is an UltraHDR image!');
}
```

### Decode an UltraHDR image

```typescript
import { decodeUltraHdr } from 'open-ultrahdr';

const buffer = await file.arrayBuffer();
const result = await decodeUltraHdr('image-1', buffer);

// Access components
const sdrBlob = new Blob([result.sdrImage], { type: 'image/jpeg' });
console.log('Image size:', result.width, 'x', result.height);
console.log('HDR capacity:', result.metadata.hdrCapacityMax, 'stops');
```

### Extract SDR base for backwards compatibility

```typescript
import { extractSdrBase } from 'open-ultrahdr';

const ultraHdrBuffer = await file.arrayBuffer();
const sdrBuffer = await extractSdrBase(ultraHdrBuffer);

// Use the SDR image for non-HDR displays
const blob = new Blob([sdrBuffer], { type: 'image/jpeg' });
```

### Encode an UltraHDR image

```typescript
import { encodeUltraHdr, defaultEncodeOptions } from 'open-ultrahdr';

const sdrBuffer = await sdrFile.arrayBuffer();
const hdrLinearData = await getHdrLinearData(); // Float32Array, 3 values per pixel

const ultraHdr = await encodeUltraHdr('encode-1', sdrBuffer, hdrLinearData, {
    ...defaultEncodeOptions,
    targetHdrCapacity: 4.0,
});

// Create downloadable file
const blob = new Blob([ultraHdr], { type: 'image/jpeg' });
```

## API Reference

### Detection

- `isUltraHdr(buffer: ArrayBuffer): Promise<boolean>` - Check if image contains UltraHDR data

### Decoding

- `decodeUltraHdr(id: string, buffer: ArrayBuffer): Promise<UltraHdrDecodeResult>` - Decode UltraHDR image
- `extractSdrBase(buffer: ArrayBuffer): Promise<ArrayBuffer>` - Extract SDR base image
- `getMetadata(buffer: ArrayBuffer): Promise<GainMapMetadata>` - Get gain map metadata only

### Encoding

- `encodeUltraHdr(id: string, sdrBuffer: ArrayBuffer, hdrBuffer: ArrayBuffer, options?: UltraHdrEncodeOptions): Promise<ArrayBuffer>` - Encode UltraHDR image

### Validation

- `validateMetadata(metadata: GainMapMetadata): Promise<boolean>` - Validate metadata
- `estimateHdrHeadroom(metadata: GainMapMetadata): Promise<number>` - Get HDR headroom in stops
- `isMeaningfulHdr(metadata: GainMapMetadata): Promise<boolean>` - Check if HDR is significant

### Configuration

- `setLocation(path: string): void` - Set WASM file location

## Types

### GainMapMetadata

```typescript
interface GainMapMetadata {
    version: string;
    baseRenditionIsHdr: boolean;
    gainMapMin: number[];  // RGB, log2 scale
    gainMapMax: number[];  // RGB, log2 scale
    gamma: number[];       // Per-channel gamma
    offsetSdr: number[];   // Black point adjustment
    offsetHdr: number[];   // Black point adjustment
    hdrCapacityMin: number;
    hdrCapacityMax: number;
}
```

### UltraHdrEncodeOptions

```typescript
interface UltraHdrEncodeOptions {
    baseQuality: number;        // 1-100
    gainMapQuality: number;     // 1-100
    targetHdrCapacity: number;  // Typically 2.0-4.0
    includeIsoMetadata: boolean;
    includeUltrahdrV1: boolean; // Android compatibility
    gainMapScale: number;       // 1, 2, or 4
}
```

## Building from Source

### Prerequisites

- Rust toolchain (1.70+)
- wasm-pack
- Node.js (18+)

### Build

```bash
# Clone the repository
git clone https://github.com/adamsilverstein/lib-open-ultrahdr.git
cd lib-open-ultrahdr

# Install dependencies
npm install

# Build WASM module
npm run build:wasm

# Build TypeScript wrapper
npm run build:js
```

### Test

```bash
npm run test:wasm
```

## License

GPL-2.0-or-later

All Rust dependencies are MIT/Apache-2.0 licensed, ensuring GPL-2.0 compatibility.

## Releasing

This project uses GitHub Actions to publish packages to npm.

### Automatic Release

Create a GitHub release with a version tag (e.g., `v0.1.2`). The workflow will automatically:
1. Build both packages
2. Run tests
3. Publish `open-ultrahdr-wasm` to npm
4. Publish `open-ultrahdr` to npm

### Manual Release

1. Go to **Actions** > **Publish to npm** in the GitHub repository
2. Click **Run workflow**
3. Optionally enable "Perform a dry run" to test without publishing
4. Click **Run workflow**

### Before Releasing

1. Update version numbers in both `wasm/package.json` and `js/package.json`
2. Ensure `js/package.json` has the correct `open-ultrahdr-wasm` dependency version
3. Commit version changes to main branch

### Required Setup (Maintainers)

Add an `NPM_TOKEN` secret to the repository:
1. Create an npm automation token at https://www.npmjs.com/settings/tokens
2. Go to repository **Settings** > **Secrets and variables** > **Actions**
3. Add a new secret named `NPM_TOKEN` with the token value

## Contributing

Contributions are welcome! Please open an issue or pull request on GitHub.
