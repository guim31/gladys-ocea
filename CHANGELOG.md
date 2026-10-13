# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The documentation in German and Spanish, published by the store from
  Gladys 5.2.

### Changed

- Quieter logs: a normal reading writes only at debug level (`LOG_LEVEL=debug`);
  info keeps the start, the connection to OCEA and the user's actions, and a
  repeated failure writes one line when it starts and one when it recovers.
- An unchanged value is sent to Gladys again at least every 12 hours, so the
  dashboard never shows "No recent value", even with a 24-hour interval.

## [1.0.1] - 2026-10-13

### Added

- Sign-in to the OCEA Smart Building resident portal with its e-mail and
  password, with automatic token renewal. The session survives restarts.
- One device per dwelling of the account: cold water and hot water (m³),
  heating in kWh when a thermal energy meter (CETC) is fitted — its index
  feeds the Gladys energy monitoring — or in heat cost allocator units (a
  counter without unit, never counted as energy).
- Readings every 6 hours by default, from 1 to 24 hours; only changed values
  are sent to Gladys.
- A **Test the connection and read now** action.
- The **OCEA consumption** dashboard widget: the consumption of the current
  month, per fluid.
- Texts in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-ocea/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-ocea/releases/tag/v1.0.1
