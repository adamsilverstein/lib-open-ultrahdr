//! UltraHDR JPEG decoder.
//!
//! Extracts SDR base, gain map, and metadata from UltraHDR JPEG files.

use crate::error::{Result, UltraHdrError};
use crate::jpeg::parser::JpegParser;
use crate::jpeg::xmp::XmpParser;
use crate::types::{GainMapMetadata, UltraHdrDecodeResult, UltraHdrProbeResult};

/// Probes an image to check if it's UltraHDR and extracts component information.
///
/// This function efficiently validates if an image is UltraHDR by checking for
/// required components (primary image, gain map, metadata) without full decoding.
/// Returns structured results useful for batch processing and filtering.
///
/// # Arguments
/// * `data` - Raw bytes of the image file
///
/// # Returns
/// `UltraHdrProbeResult` with detailed information about what was found.
/// This function never throws - it always returns a result.
pub fn probe(data: &[u8]) -> UltraHdrProbeResult {
    let mut result = UltraHdrProbeResult::default();

    // Quick check for JPEG magic bytes (early return if not JPEG)
    if data.len() < 2 || data[0] != 0xFF || data[1] != 0xD8 {
        return result;
    }

    // We found a JPEG - mark primary image as found
    result.has_primary_image = true;

    // Try to parse JPEG structure
    let parser = match JpegParser::parse(data) {
        Ok(p) => p,
        Err(_) => return result,
    };

    // Get dimensions from SOF marker
    if let Some((width, height)) = parser.get_dimensions() {
        result.width = width;
        result.height = height;
    }

    // Check for XMP metadata with gain map info
    if let Some(xmp_segment) = parser.find_xmp_segment() {
        if let Some(xmp_data) = xmp_segment.get_xmp_data() {
            if XmpParser::has_gain_map_metadata(xmp_data) {
                result.has_metadata = true;

                // Try to extract HDR capacity and version from metadata
                if let Ok(metadata) = XmpParser::parse(xmp_data) {
                    result.hdr_capacity = metadata.hdr_capacity_max;
                    result.metadata_version = metadata.version;
                }
            }
        }
    }

    // Probe for gain map image
    if let Some((gm_width, gm_height)) = probe_for_gain_map(data, &parser) {
        result.has_gain_map = true;
        result.gain_map_width = gm_width;
        result.gain_map_height = gm_height;
    }

    // Image is valid UltraHDR if it has all required components
    result.is_valid = result.has_primary_image && result.has_gain_map && result.has_metadata;

    result
}

/// Probes for gain map presence and returns its dimensions if found.
fn probe_for_gain_map(data: &[u8], parser: &JpegParser) -> Option<(u32, u32)> {
    // Method 1: Try MPF segment
    if let Some(mpf_segment) = parser.find_mpf_segment() {
        if let Some((offset, size)) = parse_mpf_for_gainmap(&mpf_segment.data) {
            let offset = offset as usize;
            let size = size as usize;

            if offset + size <= data.len() {
                let gain_map_jpeg = &data[offset..offset + size];
                if let Ok(gm_parser) = JpegParser::parse(gain_map_jpeg) {
                    if let Some((gm_width, gm_height)) = gm_parser.get_dimensions() {
                        return Some((gm_width, gm_height));
                    }
                }
            }
        }
    }

    // Method 2: Look for second JPEG after primary image EOI
    if let Ok(eoi_offset) = find_primary_eoi_offset(data) {
        let remaining = &data[eoi_offset + 2..];

        if remaining.len() >= 2 && remaining[0] == 0xFF && remaining[1] == 0xD8 {
            // Found another JPEG - try to get its dimensions
            if let Ok(gm_parser) = JpegParser::parse(remaining) {
                if let Some((gm_width, gm_height)) = gm_parser.get_dimensions() {
                    return Some((gm_width, gm_height));
                }
            }
        }
    }

    None
}

/// Checks if a JPEG contains UltraHDR/gain map metadata.
pub fn has_gainmap_metadata(data: &[u8]) -> bool {
    // Quick check for JPEG magic bytes
    if data.len() < 2 || data[0] != 0xFF || data[1] != 0xD8 {
        return false;
    }

    // Try to parse and find XMP with gain map metadata
    match JpegParser::parse(data) {
        Ok(parser) => {
            if let Some(xmp_segment) = parser.find_xmp_segment() {
                if let Some(xmp_data) = xmp_segment.get_xmp_data() {
                    return XmpParser::has_gain_map_metadata(xmp_data);
                }
            }
            // Also check for MPF segment as indicator
            parser.find_mpf_segment().is_some()
        }
        Err(_) => false,
    }
}

/// Decodes an UltraHDR JPEG, extracting all components.
pub fn decode(data: &[u8]) -> Result<UltraHdrDecodeResult> {
    let parser = JpegParser::parse(data)?;

    // Get image dimensions
    let (width, height) = parser.get_dimensions().ok_or_else(|| {
        UltraHdrError::InvalidJpeg("Cannot determine image dimensions".to_string())
    })?;

    // Extract metadata from XMP
    let metadata = extract_metadata_from_parser(&parser)?;

    // Find and extract gain map
    let (gain_map, gm_width, gm_height) = extract_gain_map(data, &parser)?;

    // Extract SDR base (the primary image without gain map)
    let sdr_image = extract_sdr_from_parser(data, &parser)?;

    Ok(UltraHdrDecodeResult::new(
        sdr_image, gain_map, metadata, width, height, gm_width, gm_height,
    ))
}

/// Extracts just the SDR base image from an UltraHDR JPEG.
///
/// Returns a valid JPEG without gain map metadata.
pub fn extract_base(data: &[u8]) -> Result<Vec<u8>> {
    let parser = JpegParser::parse(data)?;
    extract_sdr_from_parser(data, &parser)
}

/// Extracts just the metadata from an UltraHDR JPEG.
pub fn extract_metadata(data: &[u8]) -> Result<GainMapMetadata> {
    let parser = JpegParser::parse(data)?;
    extract_metadata_from_parser(&parser)
}

/// Extracts gain map metadata from parsed JPEG.
fn extract_metadata_from_parser(parser: &JpegParser) -> Result<GainMapMetadata> {
    // Find XMP segment
    let xmp_segment = parser.find_xmp_segment().ok_or(UltraHdrError::NoGainMap)?;

    let xmp_data = xmp_segment
        .get_xmp_data()
        .ok_or_else(|| UltraHdrError::XmpError("Invalid XMP segment".to_string()))?;

    if !XmpParser::has_gain_map_metadata(xmp_data) {
        return Err(UltraHdrError::NoGainMap);
    }

    XmpParser::parse(xmp_data)
}

/// Extracts the SDR base image as clean JPEG.
fn extract_sdr_from_parser(data: &[u8], _parser: &JpegParser) -> Result<Vec<u8>> {
    // Find where the gain map starts (after primary image EOI)
    // The primary image ends at the first EOI marker
    let eoi_offset = find_primary_eoi_offset(data)?;

    // Return data up to and including the first EOI
    Ok(data[..eoi_offset + 2].to_vec())
}

/// Extracts the gain map JPEG from an UltraHDR image.
fn extract_gain_map(data: &[u8], parser: &JpegParser) -> Result<(Vec<u8>, u32, u32)> {
    // Method 1: Try MPF segment
    if let Some(mpf_segment) = parser.find_mpf_segment() {
        if let Some((offset, size)) = parse_mpf_for_gainmap(&mpf_segment.data) {
            let offset = offset as usize;
            let size = size as usize;

            if offset + size <= data.len() {
                let gain_map_jpeg = data[offset..offset + size].to_vec();
                let (gm_width, gm_height) = get_jpeg_dimensions(&gain_map_jpeg)?;
                return Ok((gain_map_jpeg, gm_width, gm_height));
            }
        }
    }

    // Method 2: Look for second JPEG after primary image EOI
    let eoi_offset = find_primary_eoi_offset(data)?;
    let remaining = &data[eoi_offset + 2..];

    if remaining.len() >= 2 && remaining[0] == 0xFF && remaining[1] == 0xD8 {
        // Found another JPEG - this is the gain map
        let gain_map_jpeg = remaining.to_vec();
        let (gm_width, gm_height) = get_jpeg_dimensions(&gain_map_jpeg)?;
        return Ok((gain_map_jpeg, gm_width, gm_height));
    }

    Err(UltraHdrError::NoGainMap)
}

/// Finds the offset of the primary image's EOI marker.
fn find_primary_eoi_offset(data: &[u8]) -> Result<usize> {
    // Skip the initial SOI
    let mut pos = 2;

    while pos < data.len() - 1 {
        if data[pos] == 0xFF {
            let marker = data[pos + 1];

            // Skip padding FF bytes
            if marker == 0xFF {
                pos += 1;
                continue;
            }

            // EOI marker
            if marker == 0xD9 {
                return Ok(pos);
            }

            // SOS marker - scan through entropy data
            if marker == 0xDA {
                // Skip SOS header
                if pos + 3 >= data.len() {
                    break;
                }
                let len = u16::from_be_bytes([data[pos + 2], data[pos + 3]]) as usize;
                pos += 2 + len;

                // Scan through entropy-coded data
                while pos < data.len() - 1 {
                    if data[pos] == 0xFF {
                        let next = data[pos + 1];
                        if next == 0x00 {
                            // Stuffed byte
                            pos += 2;
                        } else if next == 0xD9 {
                            // EOI
                            return Ok(pos);
                        } else if next >= 0xD0 && next <= 0xD7 {
                            // Restart marker
                            pos += 2;
                        } else if next != 0xFF {
                            // Another marker - shouldn't happen in valid JPEG
                            break;
                        } else {
                            pos += 1;
                        }
                    } else {
                        pos += 1;
                    }
                }
            }

            // Other marker with length
            if marker != 0xD8 && marker != 0xD9 && !(marker >= 0xD0 && marker <= 0xD7) {
                if pos + 3 >= data.len() {
                    break;
                }
                let len = u16::from_be_bytes([data[pos + 2], data[pos + 3]]) as usize;
                pos += 2 + len;
            } else {
                pos += 2;
            }
        } else {
            pos += 1;
        }
    }

    Err(UltraHdrError::InvalidJpeg(
        "Could not find EOI marker".to_string(),
    ))
}

/// Parses MPF segment data to find gain map offset and size.
fn parse_mpf_for_gainmap(mpf_data: &[u8]) -> Option<(u32, u32)> {
    // Skip "MPF\0" header
    if mpf_data.len() < 4 || &mpf_data[0..4] != b"MPF\0" {
        return None;
    }

    let data = &mpf_data[4..];
    if data.len() < 8 {
        return None;
    }

    // Determine byte order
    let little_endian = data[0] == b'I' && data[1] == b'I';

    // Read helper
    let read_u16 = |offset: usize| -> Option<u16> {
        if offset + 2 > data.len() {
            return None;
        }
        Some(if little_endian {
            u16::from_le_bytes([data[offset], data[offset + 1]])
        } else {
            u16::from_be_bytes([data[offset], data[offset + 1]])
        })
    };

    let read_u32 = |offset: usize| -> Option<u32> {
        if offset + 4 > data.len() {
            return None;
        }
        Some(if little_endian {
            u32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ])
        } else {
            u32::from_be_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ])
        })
    };

    // Skip to first IFD (offset at byte 4-7 in TIFF header)
    let ifd_offset = read_u32(4)? as usize;
    if ifd_offset >= data.len() {
        return None;
    }

    // Read number of entries
    let entry_count = read_u16(ifd_offset)?;

    // Look for MPEntry tag (0xB002)
    let mut mp_entry_offset: Option<usize> = None;
    let mut mp_entry_count: Option<u32> = None;

    for i in 0..entry_count {
        let entry_start = ifd_offset + 2 + (i as usize * 12);
        if entry_start + 12 > data.len() {
            break;
        }

        let tag = read_u16(entry_start)?;

        if tag == 0xB002 {
            // MPEntry
            mp_entry_count = Some(read_u32(entry_start + 4)?);
            mp_entry_offset = Some(read_u32(entry_start + 8)? as usize);
            break;
        }
    }

    // Parse MP entries to find gain map (second image)
    let entry_offset = mp_entry_offset?;
    let count = mp_entry_count? / 16; // 16 bytes per entry

    if count >= 2 {
        // Second entry is the gain map
        let second_entry_offset = entry_offset + 16;
        if second_entry_offset + 16 <= data.len() {
            // Entry format: 4 bytes flags, 4 bytes size, 4 bytes offset, 4 bytes dependent
            let size = read_u32(second_entry_offset + 4)?;
            let offset = read_u32(second_entry_offset + 8)?;
            return Some((offset, size));
        }
    }

    None
}

/// Gets dimensions from a JPEG.
fn get_jpeg_dimensions(jpeg_data: &[u8]) -> Result<(u32, u32)> {
    let parser = JpegParser::parse(jpeg_data)?;
    parser.get_dimensions().ok_or_else(|| {
        UltraHdrError::InvalidJpeg("Cannot determine gain map dimensions".to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_has_gainmap_metadata_non_jpeg() {
        assert!(!has_gainmap_metadata(&[0x89, 0x50, 0x4E, 0x47])); // PNG
        assert!(!has_gainmap_metadata(&[]));
        assert!(!has_gainmap_metadata(&[0xFF]));
    }

    #[test]
    fn test_has_gainmap_metadata_regular_jpeg() {
        // Minimal JPEG without gain map
        let minimal_jpeg = vec![0xFF, 0xD8, 0xFF, 0xD9];
        assert!(!has_gainmap_metadata(&minimal_jpeg));
    }

    #[test]
    fn test_find_eoi_minimal_jpeg() {
        let jpeg = vec![0xFF, 0xD8, 0xFF, 0xD9];
        let result = find_primary_eoi_offset(&jpeg);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 2);
    }

    #[test]
    fn test_parse_mpf_invalid() {
        assert!(parse_mpf_for_gainmap(&[]).is_none());
        assert!(parse_mpf_for_gainmap(b"NOTMPF").is_none());
    }

    #[test]
    fn test_probe_empty_buffer() {
        let result = probe(&[]);
        assert!(!result.is_valid);
        assert!(!result.has_primary_image);
        assert!(!result.has_gain_map);
        assert!(!result.has_metadata);
        assert_eq!(result.width, 0);
        assert_eq!(result.height, 0);
    }

    #[test]
    fn test_probe_non_jpeg() {
        // PNG magic bytes
        let png = [0x89, 0x50, 0x4E, 0x47];
        let result = probe(&png);
        assert!(!result.is_valid);
        assert!(!result.has_primary_image);
    }

    #[test]
    fn test_probe_minimal_jpeg() {
        // Minimal valid JPEG (SOI + EOI)
        let minimal_jpeg = vec![0xFF, 0xD8, 0xFF, 0xD9];
        let result = probe(&minimal_jpeg);

        assert!(!result.is_valid); // Not UltraHDR
        assert!(result.has_primary_image); // But is a JPEG
        assert!(!result.has_gain_map);
        assert!(!result.has_metadata);
    }

    #[test]
    fn test_probe_never_panics() {
        // Various edge cases that should never panic
        let test_cases: Vec<&[u8]> = vec![
            &[],
            &[0xFF],
            &[0xFF, 0xD8],
            &[0xFF, 0xD8, 0xFF],
            &[0x00, 0x00, 0x00, 0x00],
            &[0xFF, 0xD8, 0xFF, 0xD9], // Minimal JPEG
        ];

        for data in test_cases {
            let result = probe(data);
            // Should return a valid result struct, not panic
            assert!(result.width == 0 || result.width > 0); // Always defined
        }
    }
}
