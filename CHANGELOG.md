# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- A "Fires around the house" device: the active wildfires of the National Interagency Fire Center
  (NIFC, WFIGS) within a radius of your house (10 to 150 miles), the distance of the nearest fire
  to the edge of its mapped perimeter, the nearest fire in words, and the total burned area.
- Scene triggers: a new fire in the radius, a fire approaching (within an alert distance of 1 to
  25 miles), a fire 100 % contained; each once per fire, with the fire details as variables.
- A scene action that reads the fires around as one sentence, and a "Show the current fires"
  button in the configuration.
- A dashboard widget listing the fires nearest first, with size, county, containment and a map.
- Options: prescribed burns, fully contained fires hidden, miles and acres or kilometres and
  hectares, refresh interval, language of the texts (English, French, German, Spanish).
- The location of the house is sent to NIFC rounded to 0.1° only, and never logged.

[Unreleased]: https://github.com/guim31/gladys-wildfires-us/commits/main
