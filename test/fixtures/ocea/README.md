# OCEA response fixtures

Shapes of the OCEA resident API answers, rebuilt from the public projects
listed in the README credits and anonymized: every identifier, name,
address and value here is made up.

- `resident.json`: `GET /api/v1/resident` (one current occupation).
- `resident-two-dwellings.json`: an account with an ended occupation and two
  current ones.
- `local.json`: `GET /api/v1/local/{id}`.
- `consos-water.json`, `consos-cetc.json`: `GET /api/v1/local/{id}/dashboard/consos`,
  without and with a thermal energy meter (CETC).
- `consos-allocators.json`: **an assumption**, no public source shows it: the
  same endpoint for a dwelling with heat cost allocators. The fluid name and
  the unit are guesses; the code classifies by unit, not by name.
