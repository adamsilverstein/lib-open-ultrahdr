// Emscripten/embind bindings exposing libultrahdr to JavaScript.
//
// The public JS surface mirrors the prior Rust crate exactly so that the
// `open-ultrahdr` package needs no changes to its public API. Metadata is
// kept in *log2* scale at the JS boundary (as the Rust crate did); we convert
// to/from linear scale when calling into libultrahdr.

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>

#include <emscripten/bind.h>
#include <emscripten/em_js.h>
#include <emscripten/val.h>

#include "ultrahdr_api.h"
#include "jpeg_meta.h"

// Throws a native JS Error so callers see a human-readable message rather than
// an opaque embind CppException pointer.
EM_JS(void, openUltraHdrThrowJsError, (const char* msg), {
  throw new Error(UTF8ToString(msg));
});

using namespace emscripten;

namespace {

// =============================================================================
// Constants & defaults (mirrors the prior Rust API)
// =============================================================================

constexpr uint8_t kDefaultBaseQuality = 85;
constexpr uint8_t kDefaultGainMapQuality = 75;
constexpr float kDefaultTargetHdrCapacity = 3.0f;

constexpr uint8_t kHighBaseQuality = 95;
constexpr uint8_t kHighGainMapQuality = 85;
constexpr float kHighTargetHdrCapacity = 4.0f;

constexpr uint8_t kSmallBaseQuality = 75;
constexpr uint8_t kSmallGainMapQuality = 65;
constexpr float kSmallTargetHdrCapacity = 3.0f;
constexpr uint8_t kSmallGainMapScale = 2;

// Minimum HDR headroom (in stops) considered meaningful.
constexpr float kMeaningfulHdrThreshold = 0.5f;

// =============================================================================
// JS-facing structs
// =============================================================================

struct UltraHdrEncodeOptions {
  int baseQuality = kDefaultBaseQuality;
  int gainMapQuality = kDefaultGainMapQuality;
  float targetHdrCapacity = kDefaultTargetHdrCapacity;
  bool includeIsoMetadata = true;
  bool includeUltrahdrV1 = true;
  int gainMapScale = 1;
};

// JS-side arrays are exchanged via `val` (JS Array) so callers see and pass
// native arrays rather than embind VectorFloat handles.
struct GainMapMetadata {
  std::string version = "1.0";
  bool baseRenditionIsHdr = false;
  val gainMapMin = val::array();
  val gainMapMax = val::array();
  val gamma = val::array();
  val offsetSdr = val::array();
  val offsetHdr = val::array();
  float hdrCapacityMin = 0.0f;
  float hdrCapacityMax = kDefaultTargetHdrCapacity;
};

struct UltraHdrProbeResult {
  bool isValid = false;
  bool hasPrimaryImage = false;
  bool hasGainMap = false;
  bool hasMetadata = false;
  int width = 0;
  int height = 0;
  int gainMapWidth = 0;
  int gainMapHeight = 0;
  float hdrCapacity = 0.0f;
  std::string metadataVersion;
};

struct UltraHdrDecodeResult {
  val sdrImage = val::undefined();
  val gainMap = val::undefined();
  GainMapMetadata metadata;
  int width = 0;
  int height = 0;
  int gainMapWidth = 0;
  int gainMapHeight = 0;
};

// =============================================================================
// Conversions
// =============================================================================

inline float linearToLog2(float linear) {
  if (linear <= 0.0f) return 0.0f;
  return std::log2(linear);
}

inline float log2ToLinear(float stops) {
  return std::exp2(stops);
}

struct Float3 {
  float v[3] = {0.0f, 0.0f, 0.0f};
  bool ok = false;
};

// Read a JS array into 3 floats. ok=false if input isn't array-like or has != 3 entries.
Float3 readFloat3(const val& arr) {
  Float3 out;
  if (!arr.isArray()) return out;
  unsigned len = arr["length"].as<unsigned>();
  if (len != 3) return out;
  out.v[0] = arr[0].as<float>();
  out.v[1] = arr[1].as<float>();
  out.v[2] = arr[2].as<float>();
  out.ok = true;
  return out;
}

val makeFloat3Array(float a, float b, float c) {
  val out = val::array();
  out.set(0, a);
  out.set(1, b);
  out.set(2, c);
  return out;
}

val makeFloat3Array(const float (&arr)[3]) {
  return makeFloat3Array(arr[0], arr[1], arr[2]);
}

GainMapMetadata fromLibUhdr(const uhdr_gainmap_metadata_t& m) {
  GainMapMetadata out;
  out.version = "1.0";
  out.baseRenditionIsHdr = false;
  out.gainMapMin = makeFloat3Array(linearToLog2(m.min_content_boost[0]),
                                   linearToLog2(m.min_content_boost[1]),
                                   linearToLog2(m.min_content_boost[2]));
  out.gainMapMax = makeFloat3Array(linearToLog2(m.max_content_boost[0]),
                                   linearToLog2(m.max_content_boost[1]),
                                   linearToLog2(m.max_content_boost[2]));
  out.gamma = makeFloat3Array(m.gamma);
  out.offsetSdr = makeFloat3Array(m.offset_sdr);
  out.offsetHdr = makeFloat3Array(m.offset_hdr);
  out.hdrCapacityMin = linearToLog2(m.hdr_capacity_min);
  out.hdrCapacityMax = linearToLog2(m.hdr_capacity_max);
  return out;
}

// =============================================================================
// F32 (RGB, 3-ch) -> F16 (RGBA, 4-ch) packing
// =============================================================================

// IEEE 754 binary32 -> binary16 round-to-nearest-even.
uint16_t floatToHalf(float f) {
  uint32_t bits;
  std::memcpy(&bits, &f, sizeof(bits));
  uint32_t sign = (bits >> 16) & 0x8000u;
  int32_t exponent = static_cast<int32_t>((bits >> 23) & 0xFFu) - 127 + 15;
  uint32_t mantissa = bits & 0x007FFFFFu;

  if (exponent >= 31) {
    // Inf or NaN.
    return static_cast<uint16_t>(sign | 0x7C00u | (mantissa ? 0x0200u : 0u));
  }
  if (exponent <= 0) {
    // Subnormal or zero.
    if (exponent < -10) {
      return static_cast<uint16_t>(sign);
    }
    mantissa |= 0x00800000u;
    uint32_t shift = static_cast<uint32_t>(14 - exponent);
    uint32_t result = mantissa >> shift;
    // Round-to-nearest-even.
    if ((mantissa >> (shift - 1)) & 1u) {
      ++result;
    }
    return static_cast<uint16_t>(sign | result);
  }
  // Normal.
  uint32_t result = (static_cast<uint32_t>(exponent) << 10) | (mantissa >> 13);
  if (mantissa & 0x00001000u) ++result;
  return static_cast<uint16_t>(sign | result);
}

// Pack a w*h Float32Array (RGB, 3 floats/pixel) to a w*h F16 RGBA (4 halves/pixel).
// Alpha is set to 1.0 (= 0x3C00 in F16).
std::vector<uint16_t> packF32RgbToF16Rgba(const float* src, size_t pixelCount) {
  constexpr uint16_t kHalfOne = 0x3C00;
  std::vector<uint16_t> out(pixelCount * 4);
  for (size_t i = 0; i < pixelCount; ++i) {
    out[i * 4 + 0] = floatToHalf(src[i * 3 + 0]);
    out[i * 4 + 1] = floatToHalf(src[i * 3 + 1]);
    out[i * 4 + 2] = floatToHalf(src[i * 3 + 2]);
    out[i * 4 + 3] = kHalfOne;
  }
  return out;
}

// =============================================================================
// JS typed-array <-> std::vector helpers
// =============================================================================

std::vector<uint8_t> u8FromVal(const val& v) {
  // Accepts a Uint8Array, Uint8ClampedArray, or any object exposing a length
  // and indexed bytes.
  unsigned length = v["length"].as<unsigned>();
  std::vector<uint8_t> out(length);
  if (length == 0) return out;
  val memoryView{typed_memory_view(length, out.data())};
  memoryView.call<void>("set", v);
  return out;
}

std::vector<float> f32FromVal(const val& v) {
  unsigned length = v["length"].as<unsigned>();
  std::vector<float> out(length);
  if (length == 0) return out;
  val memoryView{typed_memory_view(length, out.data())};
  memoryView.call<void>("set", v);
  return out;
}

val u8VectorToVal(const std::vector<uint8_t>& src) {
  val view{typed_memory_view(src.size(), src.data())};
  // Copy out into a fresh Uint8Array — the typed_memory_view aliases WASM heap
  // and would be invalidated on heap growth.
  val u8 = val::global("Uint8Array").new_(static_cast<unsigned>(src.size()));
  u8.call<void>("set", view);
  return u8;
}

// =============================================================================
// Library helpers
// =============================================================================

void throwOnError(const uhdr_error_info_t& err, const char* prefix) {
  if (err.error_code == UHDR_CODEC_OK) return;
  std::string msg = prefix;
  msg += ": ";
  if (err.has_detail && err.detail[0]) {
    msg += err.detail;
  } else {
    msg += "code " + std::to_string(static_cast<int>(err.error_code));
  }
  throw std::runtime_error(msg);
}

class DecoderHandle {
 public:
  DecoderHandle() : handle_(uhdr_create_decoder()) {
    if (!handle_) throw std::runtime_error("Failed to allocate decoder");
  }
  ~DecoderHandle() {
    if (handle_) uhdr_release_decoder(handle_);
  }
  DecoderHandle(const DecoderHandle&) = delete;
  DecoderHandle& operator=(const DecoderHandle&) = delete;
  uhdr_codec_private_t* get() { return handle_; }

 private:
  uhdr_codec_private_t* handle_ = nullptr;
};

class EncoderHandle {
 public:
  EncoderHandle() : handle_(uhdr_create_encoder()) {
    if (!handle_) throw std::runtime_error("Failed to allocate encoder");
  }
  ~EncoderHandle() {
    if (handle_) uhdr_release_encoder(handle_);
  }
  EncoderHandle(const EncoderHandle&) = delete;
  EncoderHandle& operator=(const EncoderHandle&) = delete;
  uhdr_codec_private_t* get() { return handle_; }

 private:
  uhdr_codec_private_t* handle_ = nullptr;
};

// =============================================================================
// Public API
// =============================================================================

bool isUltraHdr(const val& buffer) {
  std::vector<uint8_t> data = u8FromVal(buffer);
  if (data.empty()) return false;
  return is_uhdr_image(data.data(), static_cast<int>(data.size())) == 1;
}

UltraHdrProbeResult probeUltraHdr(const val& buffer) {
  UltraHdrProbeResult result;
  std::vector<uint8_t> data = u8FromVal(buffer);
  if (data.empty()) return result;

  // First, attempt a libultrahdr probe to see if it's a full UltraHDR image.
  bool fullProbeOk = false;
  try {
    DecoderHandle dec;
    uhdr_compressed_image_t img{};
    img.data = data.data();
    img.data_sz = data.size();
    img.capacity = data.size();
    img.cg = UHDR_CG_UNSPECIFIED;
    img.ct = UHDR_CT_UNSPECIFIED;
    img.range = UHDR_CR_UNSPECIFIED;
    auto setRes = uhdr_dec_set_image(dec.get(), &img);
    if (setRes.error_code == UHDR_CODEC_OK) {
      auto probeRes = uhdr_dec_probe(dec.get());
      if (probeRes.error_code == UHDR_CODEC_OK) {
        fullProbeOk = true;
        result.hasPrimaryImage = true;
        result.hasGainMap = true;
        result.hasMetadata = true;
        result.isValid = true;
        result.width = uhdr_dec_get_image_width(dec.get());
        result.height = uhdr_dec_get_image_height(dec.get());
        result.gainMapWidth = uhdr_dec_get_gainmap_width(dec.get());
        result.gainMapHeight = uhdr_dec_get_gainmap_height(dec.get());
        auto* meta = uhdr_dec_get_gainmap_metadata(dec.get());
        if (meta) {
          float maxLin = std::max({meta->max_content_boost[0],
                                   meta->max_content_boost[1],
                                   meta->max_content_boost[2]});
          result.hdrCapacity = linearToLog2(maxLin);
          result.metadataVersion = "1.0";
        }
      }
    }
  } catch (...) {
    // Fall through to JPEG fallback.
  }

  if (fullProbeOk) return result;

  // Not a full UltraHDR — try to identify a regular JPEG so callers can tell
  // apart "not even a JPEG" vs "JPEG without gain map".
  open_ultrahdr::JpegDims dims =
      open_ultrahdr::parseJpegDimensions(data.data(), data.size());
  if (dims.ok) {
    result.hasPrimaryImage = true;
    result.width = static_cast<int>(dims.width);
    result.height = static_cast<int>(dims.height);
  }
  return result;
}

UltraHdrDecodeResult decodeUltraHdr(const val& buffer) {
  std::vector<uint8_t> data = u8FromVal(buffer);
  if (data.empty()) throw std::runtime_error("Empty buffer");

  DecoderHandle dec;
  uhdr_compressed_image_t img{};
  img.data = data.data();
  img.data_sz = data.size();
  img.capacity = data.size();
  img.cg = UHDR_CG_UNSPECIFIED;
  img.ct = UHDR_CT_UNSPECIFIED;
  img.range = UHDR_CR_UNSPECIFIED;
  throwOnError(uhdr_dec_set_image(dec.get(), &img), "uhdr_dec_set_image");
  throwOnError(uhdr_dec_probe(dec.get()), "uhdr_dec_probe");

  UltraHdrDecodeResult out;
  out.width = uhdr_dec_get_image_width(dec.get());
  out.height = uhdr_dec_get_image_height(dec.get());
  out.gainMapWidth = uhdr_dec_get_gainmap_width(dec.get());
  out.gainMapHeight = uhdr_dec_get_gainmap_height(dec.get());

  uhdr_mem_block_t* base = uhdr_dec_get_base_image(dec.get());
  if (!base || !base->data || base->data_sz == 0) {
    throw std::runtime_error("Failed to get base image");
  }
  std::vector<uint8_t> baseBytes(static_cast<const uint8_t*>(base->data),
                                 static_cast<const uint8_t*>(base->data) + base->data_sz);
  out.sdrImage = u8VectorToVal(baseBytes);

  uhdr_mem_block_t* gm = uhdr_dec_get_gainmap_image(dec.get());
  if (!gm || !gm->data || gm->data_sz == 0) {
    throw std::runtime_error("Failed to get gain map image");
  }
  std::vector<uint8_t> gmBytes(static_cast<const uint8_t*>(gm->data),
                               static_cast<const uint8_t*>(gm->data) + gm->data_sz);
  out.gainMap = u8VectorToVal(gmBytes);

  uhdr_gainmap_metadata_t* meta = uhdr_dec_get_gainmap_metadata(dec.get());
  if (!meta) {
    throw std::runtime_error("Failed to get gain map metadata");
  }
  out.metadata = fromLibUhdr(*meta);
  return out;
}

val extractSdrBase(const val& buffer) {
  std::vector<uint8_t> data = u8FromVal(buffer);
  if (data.empty()) throw std::runtime_error("Empty buffer");

  DecoderHandle dec;
  uhdr_compressed_image_t img{};
  img.data = data.data();
  img.data_sz = data.size();
  img.capacity = data.size();
  img.cg = UHDR_CG_UNSPECIFIED;
  img.ct = UHDR_CT_UNSPECIFIED;
  img.range = UHDR_CR_UNSPECIFIED;
  throwOnError(uhdr_dec_set_image(dec.get(), &img), "uhdr_dec_set_image");
  throwOnError(uhdr_dec_probe(dec.get()), "uhdr_dec_probe");

  uhdr_mem_block_t* base = uhdr_dec_get_base_image(dec.get());
  if (!base || !base->data || base->data_sz == 0) {
    throw std::runtime_error("Failed to get base image");
  }
  std::vector<uint8_t> baseBytes(static_cast<const uint8_t*>(base->data),
                                 static_cast<const uint8_t*>(base->data) + base->data_sz);
  return u8VectorToVal(baseBytes);
}

GainMapMetadata getMetadata(const val& buffer) {
  std::vector<uint8_t> data = u8FromVal(buffer);
  if (data.empty()) throw std::runtime_error("Empty buffer");

  DecoderHandle dec;
  uhdr_compressed_image_t img{};
  img.data = data.data();
  img.data_sz = data.size();
  img.capacity = data.size();
  img.cg = UHDR_CG_UNSPECIFIED;
  img.ct = UHDR_CT_UNSPECIFIED;
  img.range = UHDR_CR_UNSPECIFIED;
  throwOnError(uhdr_dec_set_image(dec.get(), &img), "uhdr_dec_set_image");
  throwOnError(uhdr_dec_probe(dec.get()), "uhdr_dec_probe");

  uhdr_gainmap_metadata_t* meta = uhdr_dec_get_gainmap_metadata(dec.get());
  if (!meta) throw std::runtime_error("Failed to get gain map metadata");
  return fromLibUhdr(*meta);
}

val encodeUltraHdr(const val& sdrBuffer, const val& hdrBuffer,
                   const UltraHdrEncodeOptions& options) {
  std::vector<uint8_t> sdr = u8FromVal(sdrBuffer);
  if (sdr.empty()) throw std::runtime_error("Empty SDR buffer");

  // Validate JPEG magic + extract dimensions for HDR sanity-check.
  open_ultrahdr::JpegDims dims =
      open_ultrahdr::parseJpegDimensions(sdr.data(), sdr.size());
  if (!dims.ok) throw std::runtime_error("SDR buffer is not a valid JPEG");

  std::vector<float> hdr = f32FromVal(hdrBuffer);
  size_t expectedFloats = static_cast<size_t>(dims.width) *
                          static_cast<size_t>(dims.height) * 3u;
  if (hdr.size() != expectedFloats) {
    throw std::runtime_error("HDR buffer size does not match SDR dimensions: expected " +
                             std::to_string(expectedFloats) + " floats, got " +
                             std::to_string(hdr.size()));
  }

  std::vector<uint16_t> hdrHalf =
      packF32RgbToF16Rgba(hdr.data(), static_cast<size_t>(dims.width) * dims.height);

  EncoderHandle enc;

  uhdr_compressed_image_t baseImg{};
  baseImg.data = sdr.data();
  baseImg.data_sz = sdr.size();
  baseImg.capacity = sdr.size();
  baseImg.cg = UHDR_CG_UNSPECIFIED;
  baseImg.ct = UHDR_CT_UNSPECIFIED;
  baseImg.range = UHDR_CR_UNSPECIFIED;
  throwOnError(uhdr_enc_set_compressed_image(enc.get(), &baseImg, UHDR_BASE_IMG),
               "uhdr_enc_set_compressed_image");

  uhdr_raw_image_t hdrRaw{};
  hdrRaw.fmt = UHDR_IMG_FMT_64bppRGBAHalfFloat;
  hdrRaw.cg = UHDR_CG_BT_2100;
  hdrRaw.ct = UHDR_CT_LINEAR;
  hdrRaw.range = UHDR_CR_FULL_RANGE;
  hdrRaw.w = dims.width;
  hdrRaw.h = dims.height;
  hdrRaw.planes[UHDR_PLANE_PACKED] = hdrHalf.data();
  hdrRaw.planes[1] = nullptr;
  hdrRaw.planes[2] = nullptr;
  hdrRaw.stride[UHDR_PLANE_PACKED] = dims.width;  // packed = pixels-per-row
  hdrRaw.stride[1] = 0;
  hdrRaw.stride[2] = 0;
  throwOnError(uhdr_enc_set_raw_image(enc.get(), &hdrRaw, UHDR_HDR_IMG),
               "uhdr_enc_set_raw_image");

  // Quality: clamp to [0, 100].
  int baseQ = std::clamp(options.baseQuality, 0, 100);
  int gmQ = std::clamp(options.gainMapQuality, 0, 100);
  throwOnError(uhdr_enc_set_quality(enc.get(), baseQ, UHDR_BASE_IMG),
               "uhdr_enc_set_quality(base)");
  throwOnError(uhdr_enc_set_quality(enc.get(), gmQ, UHDR_GAIN_MAP_IMG),
               "uhdr_enc_set_quality(gainmap)");

  // Gain map scaling factor. libultrahdr accepts (0, 128].
  int gmScale = std::clamp(options.gainMapScale, 1, 128);
  throwOnError(uhdr_enc_set_gainmap_scale_factor(enc.get(), gmScale),
               "uhdr_enc_set_gainmap_scale_factor");

  // Map targetHdrCapacity (log2 stops) → linear max content boost.
  // min boost = 1.0 (no darkening below SDR), max = 2^stops, with sensible bounds.
  float maxBoostLinear = log2ToLinear(std::max(options.targetHdrCapacity, 0.0f));
  if (!std::isfinite(maxBoostLinear) || maxBoostLinear < 1.0f) maxBoostLinear = 1.0f;
  throwOnError(uhdr_enc_set_min_max_content_boost(enc.get(), 1.0f, maxBoostLinear),
               "uhdr_enc_set_min_max_content_boost");

  throwOnError(uhdr_encode(enc.get()), "uhdr_encode");
  uhdr_compressed_image_t* out = uhdr_get_encoded_stream(enc.get());
  if (!out || !out->data || out->data_sz == 0) {
    throw std::runtime_error("uhdr_encode produced no output");
  }
  std::vector<uint8_t> outBytes(static_cast<const uint8_t*>(out->data),
                                static_cast<const uint8_t*>(out->data) + out->data_sz);
  return u8VectorToVal(outBytes);
}

// =============================================================================
// Encode-options factories
// =============================================================================

UltraHdrEncodeOptions createDefaultOptions() {
  UltraHdrEncodeOptions o;
  o.baseQuality = kDefaultBaseQuality;
  o.gainMapQuality = kDefaultGainMapQuality;
  o.targetHdrCapacity = kDefaultTargetHdrCapacity;
  o.includeIsoMetadata = true;
  o.includeUltrahdrV1 = true;
  o.gainMapScale = 1;
  return o;
}

UltraHdrEncodeOptions createHighQualityOptions() {
  UltraHdrEncodeOptions o = createDefaultOptions();
  o.baseQuality = kHighBaseQuality;
  o.gainMapQuality = kHighGainMapQuality;
  o.targetHdrCapacity = kHighTargetHdrCapacity;
  return o;
}

UltraHdrEncodeOptions createSmallSizeOptions() {
  UltraHdrEncodeOptions o = createDefaultOptions();
  o.baseQuality = kSmallBaseQuality;
  o.gainMapQuality = kSmallGainMapQuality;
  o.targetHdrCapacity = kSmallTargetHdrCapacity;
  o.gainMapScale = kSmallGainMapScale;
  return o;
}

GainMapMetadata createDefaultMetadata() {
  GainMapMetadata m;
  m.gainMapMin = makeFloat3Array(0.0f, 0.0f, 0.0f);
  m.gainMapMax = makeFloat3Array(kDefaultTargetHdrCapacity, kDefaultTargetHdrCapacity,
                                 kDefaultTargetHdrCapacity);
  m.gamma = makeFloat3Array(1.0f, 1.0f, 1.0f);
  m.offsetSdr = makeFloat3Array(1.0f / 64.0f, 1.0f / 64.0f, 1.0f / 64.0f);
  m.offsetHdr = makeFloat3Array(1.0f / 64.0f, 1.0f / 64.0f, 1.0f / 64.0f);
  return m;
}

// =============================================================================
// Metadata helpers
// =============================================================================

bool validateMetadata(const GainMapMetadata& m) {
  Float3 mn = readFloat3(m.gainMapMin);
  Float3 mx = readFloat3(m.gainMapMax);
  Float3 gamma = readFloat3(m.gamma);
  Float3 offSdr = readFloat3(m.offsetSdr);
  Float3 offHdr = readFloat3(m.offsetHdr);
  if (!mn.ok || !mx.ok || !gamma.ok || !offSdr.ok || !offHdr.ok) return false;
  for (int i = 0; i < 3; ++i) {
    if (gamma.v[i] <= 0.0f) return false;
    if (mx.v[i] < mn.v[i]) return false;
  }
  if (m.hdrCapacityMax < m.hdrCapacityMin) return false;
  return true;
}

float estimateHdrHeadroom(const GainMapMetadata& m) {
  Float3 mx = readFloat3(m.gainMapMax);
  if (!mx.ok) return 0.0f;
  float maxStops = std::max({mx.v[0], mx.v[1], mx.v[2]});
  return std::max(maxStops, 0.0f);
}

bool isMeaningfulHdr(const GainMapMetadata& m) {
  return estimateHdrHeadroom(m) >= kMeaningfulHdrThreshold;
}

}  // namespace

// Translates std::exception to a JS Error so callers see a real message.
template <typename Fn>
auto translateErr(Fn&& fn) -> decltype(fn()) {
  try {
    return fn();
  } catch (const std::exception& e) {
    openUltraHdrThrowJsError(e.what());
    throw;  // unreachable
  } catch (...) {
    openUltraHdrThrowJsError("unknown C++ exception");
    throw;  // unreachable
  }
}

EMSCRIPTEN_BINDINGS(open_ultrahdr) {
  value_object<UltraHdrEncodeOptions>("UltraHdrEncodeOptions")
      .field("baseQuality", &UltraHdrEncodeOptions::baseQuality)
      .field("gainMapQuality", &UltraHdrEncodeOptions::gainMapQuality)
      .field("targetHdrCapacity", &UltraHdrEncodeOptions::targetHdrCapacity)
      .field("includeIsoMetadata", &UltraHdrEncodeOptions::includeIsoMetadata)
      .field("includeUltrahdrV1", &UltraHdrEncodeOptions::includeUltrahdrV1)
      .field("gainMapScale", &UltraHdrEncodeOptions::gainMapScale);

  value_object<GainMapMetadata>("GainMapMetadata")
      .field("version", &GainMapMetadata::version)
      .field("baseRenditionIsHdr", &GainMapMetadata::baseRenditionIsHdr)
      .field("gainMapMin", &GainMapMetadata::gainMapMin)
      .field("gainMapMax", &GainMapMetadata::gainMapMax)
      .field("gamma", &GainMapMetadata::gamma)
      .field("offsetSdr", &GainMapMetadata::offsetSdr)
      .field("offsetHdr", &GainMapMetadata::offsetHdr)
      .field("hdrCapacityMin", &GainMapMetadata::hdrCapacityMin)
      .field("hdrCapacityMax", &GainMapMetadata::hdrCapacityMax);

  value_object<UltraHdrProbeResult>("UltraHdrProbeResult")
      .field("isValid", &UltraHdrProbeResult::isValid)
      .field("hasPrimaryImage", &UltraHdrProbeResult::hasPrimaryImage)
      .field("hasGainMap", &UltraHdrProbeResult::hasGainMap)
      .field("hasMetadata", &UltraHdrProbeResult::hasMetadata)
      .field("width", &UltraHdrProbeResult::width)
      .field("height", &UltraHdrProbeResult::height)
      .field("gainMapWidth", &UltraHdrProbeResult::gainMapWidth)
      .field("gainMapHeight", &UltraHdrProbeResult::gainMapHeight)
      .field("hdrCapacity", &UltraHdrProbeResult::hdrCapacity)
      .field("metadataVersion", &UltraHdrProbeResult::metadataVersion);

  value_object<UltraHdrDecodeResult>("UltraHdrDecodeResult")
      .field("sdrImage", &UltraHdrDecodeResult::sdrImage)
      .field("gainMap", &UltraHdrDecodeResult::gainMap)
      .field("metadata", &UltraHdrDecodeResult::metadata)
      .field("width", &UltraHdrDecodeResult::width)
      .field("height", &UltraHdrDecodeResult::height)
      .field("gainMapWidth", &UltraHdrDecodeResult::gainMapWidth)
      .field("gainMapHeight", &UltraHdrDecodeResult::gainMapHeight);

  function("isUltraHdr", optional_override([](const val& b) {
            return translateErr([&] { return isUltraHdr(b); });
          }));
  function("probeUltraHdr", optional_override([](const val& b) {
            return translateErr([&] { return probeUltraHdr(b); });
          }));
  function("decodeUltraHdr", optional_override([](const val& b) {
            return translateErr([&] { return decodeUltraHdr(b); });
          }));
  function("encodeUltraHdr",
           optional_override([](const val& sdr, const val& hdr,
                                const UltraHdrEncodeOptions& o) {
             return translateErr([&] { return encodeUltraHdr(sdr, hdr, o); });
           }));
  function("extractSdrBase", optional_override([](const val& b) {
            return translateErr([&] { return extractSdrBase(b); });
          }));
  function("getMetadata", optional_override([](const val& b) {
            return translateErr([&] { return getMetadata(b); });
          }));
  function("createDefaultOptions", &createDefaultOptions);
  function("createHighQualityOptions", &createHighQualityOptions);
  function("createSmallSizeOptions", &createSmallSizeOptions);
  function("createDefaultMetadata", &createDefaultMetadata);
  function("validateMetadata", optional_override([](const GainMapMetadata& m) {
            return translateErr([&] { return validateMetadata(m); });
          }));
  function("estimateHdrHeadroom", optional_override([](const GainMapMetadata& m) {
            return translateErr([&] { return estimateHdrHeadroom(m); });
          }));
  function("isMeaningfulHdr", optional_override([](const GainMapMetadata& m) {
            return translateErr([&] { return isMeaningfulHdr(m); });
          }));
}
