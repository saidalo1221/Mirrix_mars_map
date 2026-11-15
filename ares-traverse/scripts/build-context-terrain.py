"""Extract bounded native pixel-center crops from the USGS global MOLA GeoTIFF."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from math import ceil, floor
from pathlib import Path
import struct
from urllib.request import Request, urlopen

PRODUCT = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
SOURCE = "https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m"
DIRECTORY = Path(__file__).resolve().parents[1] / "dist" / "assets" / "terrain"
WIDTH, HEIGHT, PPD = 46080, 23040, 128


def read_range(first, last):
    for attempt in range(3):
        try:
            request = Request(f"{PRODUCT}?range={first}-{last}", headers={"Range": f"bytes={first}-{last}"})
            with urlopen(request, timeout=35) as response:
                if response.status != 206 or not response.headers["Content-Range"].startswith(f"bytes {first}-{last}/"):
                    raise ValueError("Unexpected USGS GeoTIFF byte range")
                data = response.read()
                if len(data) != last - first + 1:
                    raise OSError("Incomplete USGS GeoTIFF response")
                return data
        except OSError:
            if attempt == 2:
                raise


def source_layout():
    header = read_range(0, 7)
    if header[:4] != b"II*\x00":
        raise ValueError("Expected little-endian GeoTIFF")
    directory, = struct.unpack_from("<I", header, 4)
    tail = read_range(directory, 2125771141)
    count, = struct.unpack_from("<H", tail)
    tags = {}
    for index in range(count):
        tag, kind, size, value = struct.unpack_from("<HHII", tail, 2 + index * 12)
        tags[tag] = (kind, size, value)
    expected = {256: WIDTH, 257: HEIGHT, 258: 16, 259: 1, 277: 1, 278: 1, 339: 2}
    if any(tags[tag][1:] != (1, value) for tag, value in expected.items()):
        raise ValueError("Unexpected MOLA sample or strip layout")
    offsets = struct.unpack_from(f"<{HEIGHT}I", tail, tags[273][2] - directory)
    sizes = struct.unpack_from(f"<{HEIGHT}I", tail, tags[279][2] - directory)
    scale_x, scale_y, _ = struct.unpack_from("<3d", tail, tags[33550][2] - directory)
    tie_x, tie_y, _, west, north, _ = struct.unpack_from("<6d", tail, tags[33922][2] - directory)
    parameters = struct.unpack_from("<8d", tail, tags[34736][2] - directory)
    # Published global extent is exactly 360 × 180° at 128 pixels per degree.
    if (parameters[:5] != (0.,) * 5 or parameters[5:7] != (3396190.,) * 2
            or tie_x != 0 or tie_y != 0 or abs(west + WIDTH * scale_x / 2) > .001
            or abs(north - HEIGHT * scale_y / 2) > .001
            or not (463 < scale_x == scale_y < 464)
            or any(size != WIDTH * 2 for size in sizes)
            or any(offset != offsets[0] + row * WIDTH * 2 for row, offset in enumerate(offsets))):
        raise ValueError("Unexpected MOLA projection or GeoTIFF row offsets")
    return offsets


def window(region):
    margin = max(.31, 6 * max(region["east"] - region["west"], region["north"] - region["south"]))
    west = floor((region["west"] - margin + 180) * PPD - .5)
    east = ceil((region["east"] + margin + 180) * PPD - .5)
    north = floor((90 - region["north"] - margin) * PPD - .5)
    south = ceil((90 - region["south"] + margin) * PPD - .5)
    if not (0 <= west < east < WIDTH and 0 <= north < south < HEIGHT):
        raise ValueError("Regional MOLA crop crosses the source boundary")
    return west, east, north, south


def main():
    offsets = source_layout()
    catalog_path = DIRECTORY / "catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    windows = [(region, window(region)) for region in catalog["regions"]]
    with ThreadPoolExecutor(max_workers=16) as pool:
        for region_id, (west, east, north, south) in windows.items():
            width = east - west + 1
            height = south - north + 1
            spans = [(offsets[row], offsets[min(row + 7, south)] + WIDTH * 2 - 1)
                     for row in range(north, south + 1, 8)]
            values = []
            for chunk in pool.map(lambda span: read_range(*span), spans):
                for start in range(west * 2, len(chunk), WIDTH * 2):
                    values.extend(struct.unpack_from(f"<{width}h", chunk, start))
            if len(values) != width * height or -32768 in values or min(values) == max(values):
                raise ValueError(f"Incomplete or invalid MOLA crop for {region_id}")
            digest = sha256(struct.pack(f"<{len(values)}h", *values)).hexdigest()
            grid = {
                "west": (west + .5) / PPD - 180, "east": (east + .5) / PPD - 180,
                "north": 90 - (north + .5) / PPD, "south": 90 - (south + .5) / PPD,
                "width": width, "height": height, "sourceUrl": SOURCE, "productUrl": PRODUCT,
                "sourceWindow": [west, north, width, height], "sourceSamplesSha256": digest,
                "values": values,
            }
            output = f"{region_id}-mola.json"
            (DIRECTORY / output).write_text(json.dumps(grid, separators=(",", ":")) + "\n", encoding="utf-8")
            region["contextDem"] = output
            print(region_id, width, height, min(values), max(values), flush=True)
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
