#!/usr/bin/env python3
"""Statically inventory or extract embedded resources from a ZWS/FWS/CWS SWF.

The script never executes ActionScript. It defaults to a read-only dry run and
requires both an explicit source SWF and --write before creating output files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import lzma
import re
import struct
import zlib
from pathlib import Path


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


UUID_PATTERN = re.compile(
    rb"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}"
)


def uuid_candidates(data: bytes) -> list[dict]:
    """Return unique UUID-shaped ASCII strings and their first byte offsets."""
    seen: set[str] = set()
    candidates: list[dict] = []
    for match in UUID_PATTERN.finditer(data):
        # Preserve byte-exact ASCII case because the UUID-shaped value is also
        # used verbatim as a repeating XOR key by some publisher generations.
        value = match.group(0).decode("ascii")
        if value in seen:
            continue
        seen.add(value)
        candidates.append({
            "value": value,
            "offset": match.start(),
            "discoveryMethod": "decompressed-swf-ascii-uuid",
        })
    return candidates


def decompress_swf(source: bytes) -> bytes:
    signature = source[:3]
    if signature == b"FWS":
        return source
    if signature == b"CWS":
        return b"FWS" + source[3:8] + zlib.decompress(source[8:])
    if signature != b"ZWS":
        raise ValueError(f"Unsupported SWF signature: {signature!r}")
    if len(source) < 17:
        raise ValueError("Truncated ZWS header")
    properties = source[12:17]
    encoded = properties[0]
    lc = encoded % 9
    encoded //= 9
    lp = encoded % 5
    pb = encoded // 5
    dictionary_size = int.from_bytes(properties[1:5], "little")
    body = lzma.decompress(
        source[17:],
        format=lzma.FORMAT_RAW,
        filters=[{
            "id": lzma.FILTER_LZMA1,
            "dict_size": dictionary_size,
            "lc": lc,
            "lp": lp,
            "pb": pb,
        }],
    )
    expected = int.from_bytes(source[4:8], "little") - 8
    if len(body) != expected:
        raise ValueError(f"ZWS length mismatch: expected {expected}, got {len(body)}")
    return b"FWS" + source[3:8] + body


def parse_tags(data: bytes) -> tuple[dict, list[tuple[int, bytes]]]:
    rect_bits = data[8] >> 3
    rect_bytes = (5 + rect_bits * 4 + 7) // 8
    offset = 8 + rect_bytes
    frame_rate = data[offset] / 256 + data[offset + 1]
    frame_count = int.from_bytes(data[offset + 2:offset + 4], "little")
    offset += 4
    tags: list[tuple[int, bytes]] = []
    while offset + 2 <= len(data):
        header = int.from_bytes(data[offset:offset + 2], "little")
        offset += 2
        code = header >> 6
        length = header & 0x3F
        if length == 0x3F:
            length = int.from_bytes(data[offset:offset + 4], "little")
            offset += 4
        if offset + length > len(data):
            raise ValueError(f"Truncated SWF tag {code}")
        tags.append((code, data[offset:offset + length]))
        offset += length
        if code == 0:
            break
    return {"frameRate": frame_rate, "frameCount": frame_count}, tags


def symbol_classes(tags: list[tuple[int, bytes]]) -> dict[int, str]:
    symbols: dict[int, str] = {}
    for code, payload in tags:
        if code != 76:
            continue
        count = int.from_bytes(payload[:2], "little")
        offset = 2
        for _ in range(count):
            character_id = int.from_bytes(payload[offset:offset + 2], "little")
            offset += 2
            end = payload.index(0, offset)
            symbols[character_id] = payload[offset:end].decode("utf-8", "replace")
            offset = end + 1
    return symbols


def safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value)[:160]


def embedded_resources(tags: list[tuple[int, bytes]], symbols: dict[int, str]) -> list[dict]:
    resources: list[dict] = []
    for tag_index, (code, payload) in enumerate(tags):
        character_id = None
        content = None
        extension = None
        media_type = None
        details: dict = {}
        if code in (21, 35, 90) and len(payload) >= 2:
            character_id = int.from_bytes(payload[:2], "little")
            content = payload[2:]
            if content.startswith(b"\x89PNG\r\n\x1a\n"):
                extension, media_type = ".png", "image/png"
            elif content.startswith(b"\xff\xd8"):
                extension, media_type = ".jpg", "image/jpeg"
        elif code == 87 and len(payload) >= 6:
            character_id = int.from_bytes(payload[:2], "little")
            content = payload[6:]
            if content.startswith(b"\xff\xfe<\x00"):
                extension, media_type = ".xml", "application/xml; charset=utf-16le"
            elif content.lstrip().startswith(b"<"):
                extension, media_type = ".xml", "application/xml"
            elif content.startswith(b"PK"):
                extension, media_type = ".zip", "application/zip"
            elif content[:3] in (b"FWS", b"CWS", b"ZWS"):
                extension, media_type = ".swf", "application/x-shockwave-flash"
        elif code == 14 and len(payload) >= 9:
            character_id = int.from_bytes(payload[:2], "little")
            sound_flags = payload[2]
            sound_format = sound_flags >> 4
            if sound_format == 2:  # SWF MP3; two signed seek-sample bytes precede the frames.
                content = payload[9:]
                extension, media_type = ".mp3", "audio/mpeg"
                details = {
                    "sampleCount": int.from_bytes(payload[3:7], "little"),
                    "sampleRateHz": (5512, 11025, 22050, 44100)[(sound_flags >> 2) & 3],
                    "channels": 2 if sound_flags & 1 else 1,
                    "seekSamples": struct.unpack("<h", payload[7:9])[0],
                }
        if content is None or extension is None or character_id is None:
            continue
        symbol = symbols.get(character_id, f"character-{character_id}")
        resources.append({
            "characterId": character_id,
            "tagCode": code,
            "tagIndex": tag_index,
            "symbol": symbol,
            "extension": extension,
            "mediaType": media_type,
            "sizeBytes": len(content),
            "sha256": sha256(content),
            "fileName": f"{character_id:03d}-{safe_name(symbol)}{extension}",
            "details": details,
            "_content": content,
        })
    return resources


def is_within(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="Explicit path to the source SWF")
    parser.add_argument("--output", help="Output directory (required with --write)")
    parser.add_argument("--write", action="store_true", help="Write embedded resources and index.json")
    args = parser.parse_args()

    source_path = Path(args.source).resolve(strict=True)
    if source_path.suffix.lower() != ".swf":
        raise SystemExit("Source must be an explicit .swf file")
    source_bytes = source_path.read_bytes()
    decompressed = decompress_swf(source_bytes)
    header, tags = parse_tags(decompressed)
    symbols = symbol_classes(tags)
    resources = embedded_resources(tags, symbols)
    public_resources = [{k: v for k, v in item.items() if k != "_content"} for item in resources]
    report = {
        "schemaVersion": 1,
        "method": "static SWF tag parsing; no ActionScript executed",
        "sourceFile": source_path.name,
        "sourceSignature": source_bytes[:3].decode("ascii", "replace"),
        "sourceVersion": source_bytes[3],
        "sourceSizeBytes": len(source_bytes),
        "sourceSha256": sha256(source_bytes),
        "decompressedSizeBytes": len(decompressed),
        "uuidCandidates": uuid_candidates(decompressed),
        **header,
        "symbolClassCount": len(symbols),
        "resources": public_resources,
    }

    if not args.write:
        print(json.dumps(report, indent=2))
        return
    if not args.output:
        raise SystemExit("--output is required with --write")
    output_path = Path(args.output).resolve()
    bundle_root = next((parent for parent in source_path.parents if parent.name.lower().endswith(".app")), source_path.parent)
    if is_within(output_path, bundle_root):
        raise SystemExit("Refusing to write inside the source application bundle")
    output_path.mkdir(parents=True, exist_ok=True)
    for resource in resources:
        (output_path / resource["fileName"]).write_bytes(resource["_content"])
    (output_path / "index.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(resources)} resources to {output_path}")


if __name__ == "__main__":
    main()
