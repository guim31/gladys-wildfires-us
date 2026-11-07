# Test fixtures

- `gladys-feature-table.json`: the category/type couples, units and poll frequencies the Gladys
  core knows, extracted from its code (see `test/gladys-rules.test.js`).
- `nifc/incidents.json` and `nifc/perimeters.json`: the real answers of the WFIGS layers
  `WFIGS_Incident_Locations_Current` and `WFIGS_Interagency_Perimeters_Current` (NIFC ArcGIS
  FeatureServer, GeoJSON) on 07/11/2026 around 18:31 UTC, unmodified, for the query the integration
  sends: around 45.7, -118.8 (Pendleton, Oregon, rounded to 0.1°), 155 miles, wildfires and
  prescribed burns, perimeters simplified to 0.002°. 39 fires: North Cayuse, Hagen, Paradise,
  McCully, the Hay Creek and Rowe Creek complexes, many prescribed burns of Oregon, Washington and
  Idaho. Public domain data of US agencies; no personal data. The fake NIFC of
  `test/helpers/world.js` serves them, filtered by category and distance like the real layers.
