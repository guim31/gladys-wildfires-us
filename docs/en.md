# US Wildfires

Follow the active wildfires around your home in the United States from Gladys, with the official data of
the [National Interagency Fire Center](https://www.nifc.gov) (NIFC): the incidents and the mapped fire
perimeters of WFIGS (Wildland Fire Interagency Geospatial Services), public domain, updated every few
minutes. No account, no API key.

For each fire within your radius: its name, its distance (to the edge of its mapped perimeter when there
is one), its size, its containment, its county and state.

This is not an official alert service: in an emergency, follow your local authorities, your county
emergency alerts and the evacuation orders. Not affiliated with NIFC, the US Forest Service or any other
agency.

## What you get

- A **Fires around the house** device: number of fires in the radius, distance of the nearest fire, the
  nearest fire in words, and the total burned area, with their history.
- A **dashboard widget** listing the fires nearest first, with their size and containment.
- Three **scene triggers**: a new fire in the radius, a fire approaching (within the alert distance), a
  fire 100 % contained.
- A **scene action** that reads the fires around as one sentence, to send by message or have it read
  aloud.

## Requirements

- Gladys Assistant 5.3 or later.
- Internet access from the Gladys host (the integration reads `services3.arcgis.com`, the ArcGIS
  service of NIFC).
- A location for your house in Gladys (Settings → Houses), or coordinates typed in the configuration.
  The data covers the United States (and Puerto Rico) only.

## Configuration

### Settings

| Setting                       | What it does                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Centre latitude and longitude | Centre of the area. Leave both empty to use the location of your house in Gladys. Decimal comma accepted. |
| Radius                        | 10, 25, 50 (by default), 100 or 150 miles.                                                                |
| Alert distance                | 1 to 25 miles (10 by default): the "Fire approaching" trigger fires when a fire comes this close.         |
| Include prescribed burns      | Also follow the planned burns lit by land managers ("RX"). Off by default.                                |
| Ignore fully contained fires  | Hide the fires at 100 % containment, which stay listed until declared out. Off by default.                |
| Units                         | Miles and acres (by default), or kilometres and hectares.                                                 |
| Refresh interval              | 10, 15 (by default), 30 or 60 minutes.                                                                    |
| Language of the texts         | Names of the features (at their creation) and texts sent to the scenes. French by default.                |

Save, then open the **Discover** tab of the integration and create the **Fires around the house** device.
The **Show the current fires** button of the configuration lists the fires around right away: a quick way
to check the settings.

### The followed fires

A fire is followed when NIFC lists it as current, it is a wildfire (or a prescribed burn, if chosen), and
its distance is within the radius. The distance is measured to the **edge of its mapped perimeter** when
NIFC has one (0 when your house is inside it), else to its **point of origin**. Large fires are often
much closer by their perimeter than by their point: the Hagen fire of the test recording is 25 miles away
by its point and 21 by its perimeter.

Privacy: the location sent to NIFC is **rounded to 0.1°** (about 7 miles), with a radius widened
accordingly; the exact distance is computed in the container. The location of the house is never written
to the logs nor to `/data`.

## Device

| Feature               | Type              | Value                                                                                   |
| --------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| Fires in the radius   | Counter           | Number of followed fires                                                                |
| Nearest fire distance | Distance (mi, km) | Distance to the nearest fire; 1,000 when there is none, so a "below 10" condition holds |
| Nearest fire          | Text              | e.g. `North Cayuse · 15 mi · 4,887 acres · 97% contained · Umatilla, OR`                |
| Total burned area     | Area (km²)        | Area of the followed fires. Gladys has no acre unit: 1 km² is 247 acres                 |

The unit of the distance is the one of the **Units** setting when the device is created; it then stays
the same (delete and create the device again to change it). When NIFC does not answer, nothing is
published: the last values stay, and the configuration screen says it. The values are read in the
container every refresh interval: the device is not polled by Gladys.

## Dashboard widget

**Wildfires around**: a heading with the number of fires, then up to 8 fires, nearest first. Each row
shows the name, the distance, the size and the county, and the containment as a badge (green at 100 %).
Tap a row to see the discovery date, the cause, the NIFC identifier and a map of the fire's location. The
distances follow the units of your Gladys account. The footer gives the source and the time of the last
reading; the **InciWeb** button (incident news) can be hidden in the settings of the widget.

## Scene triggers

**US wildfires: new fire in the radius** fires when a fire not seen before enters the radius. Filter:
incident types (wildfire, prescribed burn).

**US wildfires: fire approaching** fires when a fire comes within the alert distance of the configuration,
a new fire included. Filter: incident types.

**US wildfires: fire 100 % contained** fires when a followed fire reaches 100 % containment.

Each trigger fires **once per fire**: a perimeter redrawn back and forth across the alert distance does not
fire again. The fires already listed when the integration starts for the first time, or when you change
its configuration, fire nothing: they are not news. What was seen is kept under `/data`: a restart fires
nothing for the fires already seen. At most 20 events fire per refresh.

Variables of the three triggers: `name`, `incident_type` (`wildfire`, `prescribed`), `distance` and
`distance_unit` (`mi` or `km`), `area` and `area_unit` (`acres` or `ha`), `containment` (percent, empty
when NIFC does not say), `state` (`CA`, `OR`…), `county`, `cause` (`Human`, `Natural`, `Undetermined`, as
published) and `summary` (one line, like the Nearest fire feature).

## Scene action

**US wildfires: read the fires around** reads NIFC again if the last reading is older than the refresh
interval, then returns:

- `text`: the fires in one sentence, e.g. `5 fires within 50 mi: North Cayuse, 15 mi; Hagen, 21 mi;
Dorran Road, 22 mi; 1924, 35 mi; Paradise, 41 mi.` (5 fires at most, then "and N more");
- `count`: the number of fires.

## Scene examples

- **Message when a fire comes close**: trigger "US wildfires: fire approaching", action "Send a message"
  with `{{triggerEvent.data.summary}}`.
- **Morning briefing in fire season**: every day at 7:30, "US wildfires: read the fires around", then
  "Send a message" with its `text`, only if `count` is above 0.
- **Close the windows and stop the ventilation**: when "Nearest fire distance" goes below 10, turn off the
  heat recovery ventilator and send a reminder to close the windows (smoke).
- **Good news**: on "US wildfires: fire 100 % contained", send `{{triggerEvent.data.name}} is contained`.

## Data sources, terms and quotas

- Data: NIFC, WFIGS layers "Incident Locations Current" and "Interagency Perimeters Current", public
  domain, read from [NIFC open data](https://data-nifc.opendata.arcgis.com) without an account. The
  incidents come from IRWIN, the shared system of the federal, state and local fire agencies.
- The data is entered by the agencies, sometimes late: a new fire may appear after a delay, the size and
  containment are those last reported, small fires often have no perimeter, and a fire stays "current"
  until it is declared out. It never replaces the alerts and evacuation orders of your local authorities.
  See [Ready.gov](https://www.ready.gov/wildfires) to prepare.
- Quotas: NIFC publishes none for these public layers. The integration asks twice per refresh interval
  (15 minutes by default), only for the area around your house, with simplified perimeters (about 200 m
  precision): a few tens of kilobytes per cycle.

## Troubleshooting

- **"No centre" in the configuration**: give your house a location in Gladys (Settings → Houses), or type
  coordinates.
- **"NIFC does not answer"**: the ArcGIS service is down or unreachable from the Gladys host. The last
  values stay; the integration tries again at every refresh and says so in its logs once.
- **No fire at all**: check that the centre is in the United States, and widen the radius; outside the
  fire season, there may simply be none.
- **Many small fires I do not care about**: turn on "Ignore fully contained fires", and keep the prescribed
  burns off.
- **No trigger after a change of settings**: expected, the fires already there are not news.
- **The names of the features are in the wrong language, or the distance in the wrong unit**: they are set
  when the device is created. Change the setting, delete the device, then create it again from the
  Discover tab.
- Logs: the integration page of Gladys, Logs tab. Set `LOG_LEVEL=debug` for a line per reading.

## Limits

- United States and Puerto Rico only: WFIGS does not cover Canada or Mexico.
- The distance is measured to the mapped perimeter, which may be a day old or more; between two mappings,
  a fast fire can be closer than shown. Small fires have only a point.
- The size, containment and cause are the ones the agencies report: they can lag behind the field.
- NIFC does not publish the InciWeb page of an incident: the widget links to the InciWeb home page.
- Tested against the real NIFC service (recording of 7 November 2026 around Pendleton, Oregon), not on a
  real fire near a Gladys house: feedback is welcome on the forum.
