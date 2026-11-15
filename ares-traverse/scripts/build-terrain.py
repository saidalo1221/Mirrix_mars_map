"""Build offline ARES elevation grids from NASA PDS and USGS source rasters.

Requires Python 3, NumPy, and Pillow. Supply --source-dir for previously
downloaded files or omit it to read the source products over HTTPS. The
terrain catalog records the source URLs and exact ranges for reproducibility.
"""

import argparse
from hashlib import sha256
from http.client import IncompleteRead
from io import BytesIO
import json
from math import ceil, cos, degrees, floor, radians
from pathlib import Path
import re
from urllib.error import URLError
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image


MOLA_DIRECTORY = (
    'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/'
)
MOLA_URL = MOLA_DIRECTORY + 'megt90n000cb.img'
JEZERO_URL = (
    'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/'
    'M20_JezeroCrater_CTXDEM_20m.tif'
)
JEZERO_CATALOG = 'https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic'
JEZERO_BOUNDS = (77.365, 77.487, 18.402, 18.492)
GALE_URL = (
    'https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_040700_040799/'
    'ESP_040770_1755_ESP_039280_1755/DTEEC_040770_1755_039280_1755_A01.IMG'
)
GALE_CATALOG = 'https://www.uahirise.org/dtm/dtm.php?ID=ESP_040770_1755'
OUTPUT_DIRECTORY = Path(__file__).resolve().parents[1] / 'dist' / 'assets' / 'terrain'


def download(url, start, end):
    headers = {'Range': f'bytes={start}-{end}'}
    with urlopen(Request(url, headers=headers), timeout=30) as response:
        if response.status != 206 or not response.headers.get('Content-Range', '').startswith(f'bytes {start}-{end}/'):
            raise ValueError(f'Server did not provide the requested byte range: {url}')
        return response.read()


def download_range(url, first, last):
    # Short ranges keep interrupted source requests inexpensive to retry.
    chunk_size = 512 * 1024
    result = bytearray()
    for start in range(first, last + 1, chunk_size):
        end = min(start + chunk_size - 1, last)
        for attempt in range(3):
            try:
                chunk = download(url, start, end)
                if len(chunk) != end - start + 1:
                    raise ConnectionError(f'Incomplete download of bytes {start}–{end}')
            except (ConnectionError, TimeoutError, URLError, IncompleteRead):
                if attempt == 2:
                    raise
            else:
                result.extend(chunk)
                break
    return bytes(result)


def source_bytes(url, name, source_dir, byte_range):
    if source_dir:
        data = (source_dir / name).read_bytes()
        if len(data) != byte_range[1] - byte_range[0] + 1:
            raise ValueError(f'Incomplete source bytes: {name}')
        return data
    return download_range(url, *byte_range)


def mola_grid(source_dir):
    data = source_bytes(MOLA_URL, 'mola-source.img.tmp', source_dir, (0, 2073599))
    # PDS3 label specifies big-endian signed 16-bit heights. Swap longitude
    # halves to make the first column just east of 180°W.
    raw = np.frombuffer(data, dtype='>i2').reshape((720, 1440))
    if (int(raw.min()), int(raw.max())) != (-8068, 21134):
        raise ValueError('MOLA extent differs from the PDS3 label')
    values = np.roll(raw, -720, axis=1).flatten().tolist()
    return {
        'id': 'mola', 'name': 'Global MOLA topography', 'url': 'mola.json',
        'west': -179.875, 'east': 179.875, 'south': -89.875, 'north': 89.875,
        'width': 1440, 'height': 720, 'wrapLongitude': True,
        'resolutionMeters': 14818,
        'resolutionNote': '0.25° grid, 14.818 km nominal at the equator',
        'datum': 'GMM3 Mars areoid (degree and order 50)',
        'source': 'NASA PDS • Mars Global Surveyor MOLA MEGDR 4 pixels/degree',
        'sourceUrl': MOLA_DIRECTORY + 'megt90n000cb.lbl',
        'productUrl': MOLA_URL,
        'sourceSha256': sha256(data).hexdigest(),
        'processing': 'Native NASA grid cells with centers derived from the 0.25° bin extents. Columns rotated to signed east longitude. PDS interpolates empty bins.',
        'values': values,
    }


def jezero_grid(source_dir):
    header_range = (0, 65535)
    header = source_bytes(JEZERO_URL, 'jezero-source-head.tif.tmp', source_dir, header_range)
    image = Image.open(BytesIO(header))
    tags = image.tag_v2
    key_values = tags[34735][4:]
    geokeys = {key: (location, count, offset)
               for key, location, count, offset in zip(key_values[::4], key_values[1::4],
                                                       key_values[2::4], key_values[3::4])}
    if (image.size != (4456, 5067) or image.mode != 'F' or tags[259] != 1
            or tags[278] != 1 or geokeys[3075] != (0, 1, 17) or geokeys[1025] != (0, 1, 1)):
        raise ValueError('Unexpected TIFF layout or projection for Jezero CTX DEM')
    parameters = tags[34736]
    radius = parameters[geokeys[2057][2]]
    standard_parallel = parameters[geokeys[3078][2]]
    lon_origin = parameters[geokeys[3082][2]]
    lat_origin = parameters[geokeys[3083][2]]
    false_easting = parameters[geokeys[3088][2]]
    false_northing = parameters[geokeys[3089][2]]
    tie_column, tie_row, _, x_origin, y_origin, _ = tags[33922]
    step_x, step_y, _ = tags[33550]
    if (radius != 3396190 or standard_parallel != 18.4663 or lon_origin != 0
            or lat_origin != 0 or false_easting != 0 or false_northing != 0
            or tie_column != 0 or tie_row != 0 or step_x != 20 or step_y != 20):
        raise ValueError('Unexpected GeoTIFF equirectangular grid parameters')

    west, east, south, north = JEZERO_BOUNDS
    x_factor = radius * cos(radians(standard_parallel))
    column_first = ceil((radians(west) * x_factor - x_origin) / step_x - 0.5)
    column_last = floor((radians(east) * x_factor - x_origin) / step_x - 0.5)
    row_first = ceil((y_origin - radians(north) * radius) / step_y - 0.5)
    row_last = floor((y_origin - radians(south) * radius) / step_y - 0.5)
    if not (0 <= column_first <= column_last < image.width and 0 <= row_first <= row_last < image.height):
        raise ValueError('Requested Jezero crop exceeds source bounds')

    offsets, sizes = tags[273], tags[279]
    if any(sizes[row] != image.width * 4 or offsets[row] != offsets[row_first] + (row - row_first) * image.width * 4
           for row in range(row_first, row_last + 1)):
        raise ValueError('Jezero raster rows are not stored contiguously')
    rows_range = (offsets[row_first], offsets[row_last] + sizes[row_last] - 1)
    data = source_bytes(JEZERO_URL, 'jezero-source-window.tif.tmp', source_dir, rows_range)
    row_count = row_last - row_first + 1
    endian = '<' if header[:2] == b'II' else '>'
    rows = np.frombuffer(data, dtype=f'{endian}f4').reshape((row_count, image.width))
    crop = rows[:, column_first:column_last + 1]
    no_data = np.float32(tags[42113])
    values = [round(float(value), 2) if np.isfinite(value) and value != no_data else None
              for value in crop.flat]

    return {
        'id': 'jezero', 'name': 'Jezero western fan', 'url': 'jezero.json',
        'west': degrees((x_origin + (column_first + 0.5) * step_x) / x_factor),
        'east': degrees((x_origin + (column_last + 0.5) * step_x) / x_factor),
        'south': degrees((y_origin - (row_last + 0.5) * step_y) / radius),
        'north': degrees((y_origin - (row_first + 0.5) * step_y) / radius),
        'width': crop.shape[1], 'height': row_count,
        'resolutionMeters': step_x,
        'resolutionNote': 'Native 20 m spacing in source projection; local east–west ground spacing varies with latitude.',
        'datum': 'Mars MOLA-aligned topography (areoid reference)',
        'source': 'USGS Astrogeology / NASA Mars 2020 • CTX stereo DEM mosaic',
        'sourceUrl': JEZERO_CATALOG,
        'productUrl': JEZERO_URL,
        'productLabelUrl': (
            'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/'
            'ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.xml'
        ),
        'sourceHeaderRange': list(header_range), 'sourceRowsRange': list(rows_range),
        'sourceHeaderSha256': sha256(header).hexdigest(), 'sourceRowsSha256': sha256(data).hexdigest(),
        'processing': 'Native center pixels from Jezero CTX Science Investigation DEM; inverse equirectangular projection to planetocentric coordinates; heights rounded to 0.01 m for serialization only.',
        'demo': {
            'start': {'lat': 18.4446, 'lon': 77.4509},
            'end': {'lat': 18.4608, 'lon': 77.4065},
            'waypoints': [{
                'id': 'fan-observation', 'name': 'Fan-front observation',
                'lat': 18.4490, 'lon': 77.4135,
                'description': 'Hypothetical stop to look for exposed layering near the western fan front.',
            }],
            'description': 'Plan a hypothetical traverse from the Perseverance landing vicinity toward the Jezero western fan. The destination and observation stop are proposed planning points.',
        },
        'values': values,
    }


def gale_grid(source_dir):
    header_range = (0, 16383)
    header = source_bytes(GALE_URL, 'gale-hirise-head.img.tmp', source_dir, header_range)
    label = header.split(b'\r\nEND\r\n', 1)[0].decode('ascii')

    def field(name):
        match = re.search(rf'^\s*{re.escape(name)}\s*=\s*([^\r\n]+)', label, re.MULTILINE)
        if match is None:
            raise ValueError(f'Gale DTM label lacks {name}')
        return match.group(1).split('<', 1)[0].strip().strip('"')

    if (field('SAMPLE_TYPE') != 'PC_REAL' or field('SAMPLE_BITS') != '32'
            or field('MAP_PROJECTION_TYPE') != 'EQUIRECTANGULAR' or field('CENTER_LATITUDE') != '0.0'
            or field('MAP_PROJECTION_ROTATION') != '0.0' or field('SCALING_FACTOR') != '1.0'
            or field('OFFSET') != '0.0' or field('MISSING_CONSTANT') != '16#FF7FFFFB#'):
        raise ValueError('Unexpected format or projection for Gale HiRISE DTM')

    row_first, row_last = 4448, 4778
    column_first, column_last = 1300, 2880
    stride = 10
    width = int(field('LINE_SAMPLES'))
    record_bytes = int(field('RECORD_BYTES'))
    if record_bytes != width * 4 or column_last >= width or row_last >= int(field('LINES')):
        raise ValueError('Unexpected Gale DTM dimensions')
    image_offset = (int(field('^IMAGE')) - 1) * record_bytes
    byte_range = (image_offset + row_first * record_bytes, image_offset + (row_last + 1) * record_bytes - 1)
    data = source_bytes(GALE_URL, 'gale-hirise-window.tmp', source_dir, byte_range)
    raw = np.frombuffer(data, dtype='<f4').reshape((row_last - row_first + 1, width))
    crop = raw[::stride, column_first:column_last + 1:stride]
    no_data = np.uint32(0xFF7FFFFB).view(np.float32)
    values = [round(float(value), 2) if np.isfinite(value) and value != no_data else None
              for value in crop.flat]
    pixels_per_degree = float(field('MAP_RESOLUTION'))
    center_longitude = float(field('CENTER_LONGITUDE'))
    line_offset = float(field('LINE_PROJECTION_OFFSET'))
    sample_offset = float(field('SAMPLE_PROJECTION_OFFSET'))
    return {
        'id': 'gale', 'name': 'Gale lower Mount Sharp', 'url': 'gale.json',
        'west': center_longitude + (column_first + 1 - sample_offset) / pixels_per_degree,
        'east': center_longitude + (column_last + 1 - sample_offset) / pixels_per_degree,
        'south': (line_offset - row_last - 1) / pixels_per_degree,
        'north': (line_offset - row_first - 1) / pixels_per_degree,
        'width': crop.shape[1], 'height': crop.shape[0],
        'resolutionMeters': round(float(field('MAP_SCALE')) * stride, 2),
        'resolutionNote': 'Approximately 10.1 m grid posts, every tenth native 1.01 m sample; detail below the grid spacing is unresolved.',
        'datum': 'Mars 2000 equipotential surface (areoid)',
        'source': 'NASA / JPL-Caltech / University of Arizona • HiRISE stereo DTM',
        'sourceUrl': GALE_CATALOG,
        'productUrl': GALE_URL,
        'productSpecificationUrl': 'https://hirise-pds.lpl.arizona.edu/PDS/DOCUMENT/HIRISE_EDR_RDR_VOL_SIS.PDF',
        'sourceHeaderRange': list(header_range), 'sourceRowsRange': list(byte_range),
        'sourceHeaderSha256': sha256(header).hexdigest(), 'sourceRowsSha256': sha256(data).hexdigest(),
        'processing': 'DTEEC_040770_1755_039280_1755_A01. Pixel centers from PDS3 line/sample offsets, sampled at a ten-pixel interval along each axis. No-data retained; heights rounded to 0.01 m for serialization only.',
        'demo': {
            'start': {'lat': -4.6591, 'lon': 137.3730},
            'end': {'lat': -4.6631, 'lon': 137.3630},
            'waypoints': [{
                'id': 'gale-outcrop-observation', 'name': 'Lower-slope observation',
                'lat': -4.6595, 'lon': 137.3655,
                'description': 'Hypothetical stop to inspect bedding and compare material along the lower slopes.',
            }],
            'description': 'Compare hypothetical traverses on the lower slopes of Mount Sharp near Pahrump Hills, which Curiosity explored.',
        },
        'values': values,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, help='Read source bytes from a local cache directory')
    parser.add_argument('--output-dir', type=Path, default=OUTPUT_DIRECTORY)
    args = parser.parse_args()
    grids = [mola_grid(args.source_dir), jezero_grid(args.source_dir), gale_grid(args.source_dir)]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    catalog = []
    for grid in grids:
        (args.output_dir / grid['url']).write_text(json.dumps(grid, separators=(',', ':'), allow_nan=False), encoding='utf-8')
        catalog.append({key: value for key, value in grid.items() if key != 'values'})
    (args.output_dir / 'catalog.json').write_text(
        json.dumps({'global': catalog[0], 'regions': catalog[1:]}, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
