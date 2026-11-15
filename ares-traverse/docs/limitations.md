# Limitations

- Global MOLA elevation samples are about 14.8 km apart at the equator. Regional routing is limited to the bundled analysis footprints listed in the catalog.
- Regional grid-scale slopes cannot resolve rocks, wheel ruts, sand strength, shadows, cliffs between cells, or local obstacles. Travel time uses an illustrative walking model without suit, fatigue, thermal, energy, or oxygen inputs.
- Candidate generation searches two stop sets in fixed stop order and compares discrete paths. It does not enumerate all feasible missions or optimize stop order.
- The globe uses a spherical reference model and an authentic imagery texture. Elevation-displaced geometry is available in the regional Terrain mode. The mesh decimation and 3× vertical exaggeration affect appearance.
- In 2D, global imagery becomes pixelated at regional scales. At global zoom, regional routes occupy a small part of the view.
- Historical rover photographs have contextual captions. Proposed stop coordinates are planning targets. A rover image is not mapped to a proposed observation unless its source verifies that relationship.
- WebGL is needed for Globe and Terrain. The 2D view retains planning functionality if WebGL fails.
- ARES Navigator is an educational prototype. It has no NASA certification and cannot validate an EVA route for use.
