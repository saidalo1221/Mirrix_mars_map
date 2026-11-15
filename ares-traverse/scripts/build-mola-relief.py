"""Render the bundled NASA MOLA grid as a colorized hillshade for the Mars map."""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


ASSETS = Path(__file__).resolve().parents[1] / 'dist' / 'assets'
MARS_RADIUS_M = 3_389_500
EXAGGERATION = 5
SUN_AZIMUTH = np.deg2rad(315)
SUN_ALTITUDE = np.deg2rad(44)
PALETTE_METERS = [-8500, -5500, -2500, 0, 2500, 5500, 9500, 15000, 22000]
PALETTE_RGB = [
    (51, 36, 48), (90, 58, 66), (141, 79, 66), (181, 113, 78),
    (206, 146, 97), (227, 175, 119), (237, 197, 147),
    (241, 217, 180), (254, 235, 205),
]


def color_relief(grid):
    rows, columns = grid['height'], grid['width']
    height = np.asarray(grid['values'], dtype=np.float64).reshape((rows, columns))
    lon_step = (grid['east'] - grid['west']) / (columns - 1)
    lat_step = (grid['north'] - grid['south']) / (rows - 1)
    if not np.isclose(columns * lon_step, 360) or not np.isclose(rows * lat_step, 180):
        raise ValueError('Expected a complete cell-centered equirectangular Mars grid')
    if not np.isfinite(height).all():
        raise ValueError('MOLA hillshade requires valid heights over the entire globe')

    latitude = np.deg2rad(np.linspace(grid['north'], grid['south'], rows))[:, None]
    east_step = MARS_RADIUS_M * np.deg2rad(lon_step) * np.cos(latitude)
    north_step = MARS_RADIUS_M * np.deg2rad(lat_step)
    east_slope = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * east_step)
    north_slope = -np.gradient(height, axis=0) / north_step
    east_normal = -EXAGGERATION * east_slope
    north_normal = -EXAGGERATION * north_slope
    sun_east = np.sin(SUN_AZIMUTH) * np.cos(SUN_ALTITUDE)
    sun_north = np.cos(SUN_AZIMUTH) * np.cos(SUN_ALTITUDE)
    sun_up = np.sin(SUN_ALTITUDE)
    incident = (east_normal * sun_east + north_normal * sun_north + sun_up) / np.sqrt(
        east_normal**2 + north_normal**2 + 1)
    shade = .52 + .57 * np.clip(incident, 0, 1)

    color = np.stack([
        np.interp(height, PALETTE_METERS, channel)
        for channel in zip(*PALETTE_RGB)
    ], axis=-1)
    return Image.fromarray(np.clip(color * shade[:, :, None], 0, 255).astype(np.uint8))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--grid', type=Path, default=ASSETS / 'terrain' / 'mola.json')
    parser.add_argument('--output', type=Path, default=ASSETS / 'maps' / 'mola-relief.jpg')
    args = parser.parse_args()
    grid = json.loads(args.grid.read_text(encoding='utf-8'))
    image = color_relief(grid)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, quality=93, subsampling=0, optimize=True)


if __name__ == '__main__':
    main()
