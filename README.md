# US Wildfires for Gladys Assistant

Active wildfires around your home in the United States, in
[Gladys Assistant](https://gladysassistant.com): distance, size and containment of every fire
within a radius of your house, from the official data of the
[National Interagency Fire Center](https://www.nifc.gov) (NIFC, WFIGS layers, public domain). No
account, no API key.

Not an official alert service: in an emergency, follow your local authorities, the emergency
alerts of your county and the evacuation orders. Not affiliated with NIFC, the US Forest Service or
any other agency.

## Features

- **A "Fires around the house" device**: number of fires in the radius, distance of the nearest
  fire (to the edge of its mapped perimeter when there is one, 0 inside it), the nearest fire in
  words, total burned area; with history.
- **Scene triggers**: a new fire in the radius, a fire approaching (within an alert distance of 1 to
  25 miles), a fire 100 % contained; each once per fire, with the fire details as scene variables.
- **Scene action**: the fires around as one sentence, to send by message or have read aloud.
- **Dashboard widget**: the fires nearest first, with size, county and a containment badge; a map
  link per fire, and InciWeb.
- Wildfires only by default; prescribed burns and fully contained fires as options. Miles and acres
  or kilometres and hectares.
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.3 or later.
- Internet access from the Gladys host (`services3.arcgis.com`, the ArcGIS service of NIFC).
- A location for your house in Gladys, or coordinates in the configuration, in the United States.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-wildfires-us` (or install it from the catalog once it is
   listed). The install screen shows the **location** access it asks for (the centre of the area).
2. In **Configuration**, choose the radius, the alert distance and the units, then save. **Show
   the current fires** lists what your settings catch.
3. Open the **Discover** tab and add the **Fires around the house** device.

The user guide is in [`docs/en.md`](docs/en.md) ([français](docs/fr.md), [Deutsch](docs/de.md),
[español](docs/es.md)); Gladys links it from the Configuration screen.

## How it works

```
Integration container ──HTTPS──▶ services3.arcgis.com   WFIGS_Incident_Locations_Current
      │                                                  WFIGS_Interagency_Perimeters_Current
      │ SDK (WebSocket + host API)
      ▼
Gladys core ── device, states, scene events, scene action, widget
```

- Every 10, 15, 30 or 60 minutes the container queries both layers **around the house only**: an
  ArcGIS distance query centred on the location **rounded to 0.1°**, its radius widened by 5 miles
  to make up for the rounding; perimeters simplified to about 200 m. The exact distance is then
  computed in the container: the exact location of the house never leaves Gladys, and never
  reaches the logs.
- Incidents and perimeters are joined on their IRWIN id. The distance is measured to the
  perimeter (planar projection at the house, checked against the ArcGIS distance queries), else to
  the point of origin.
- The device is published with `should_poll: false`: the core does not poll external devices
  reliably (GladysAssistant/Gladys#3198).
- The fires seen are kept under `/data`, so a restart fires no trigger for a fire already seen; the
  fires already there at the first start or after a change of settings are not news either.

## Limitations

- United States and Puerto Rico only (the coverage of WFIGS).
- Perimeters are mapped every day or so, sizes and containment are reported by the agencies: a fast
  fire can be closer, or bigger, than shown.
- NIFC does not publish the InciWeb page of an incident: the widget links to InciWeb's home page.
- Gladys has no acre unit: the area feature is in km² (the texts give acres).
- Developed and tested against the real NIFC service and the SDK's fake Gladys; not yet on a real
  Gladys instance near a real fire: feedback welcome.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake NIFC serving real answers recorded on
07/11/2026 around Pendleton, Oregon (`test/fixtures/nifc/`): never the network.

## Credits

- Data: [National Interagency Fire Center](https://www.nifc.gov), WFIGS
  ([NIFC open data](https://data-nifc.opendata.arcgis.com)), public domain; incidents from IRWIN,
  shared by the federal, state and local fire agencies.
- The Canadian counterpart in the Gladys store is `gladys-feux-canada` by LM1LC3N7; this
  integration was written separately, no code is shared.
- Cover: the NIFC logo, public domain (U.S. Government), from
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:US-NationalInteragencyFireCenter-Logo.svg).
- Built on the [Gladys integration SDK](https://github.com/GladysAssistant/integration-sdk-js) and
  the official JavaScript template.

## License

[Apache 2.0](LICENSE).
