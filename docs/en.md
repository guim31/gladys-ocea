# OCEA Smart Building

Reads the meters of your dwelling from the **OCEA Smart Building resident
portal** (<https://espace-resident.ocea-sb.com>): cold water, hot water and
heating, when your building's meters are read remotely by OCEA.

> **Not affiliated with OCEA Smart Building.** OCEA publishes no public API:
> this integration reads the portal like your browser does, and can stop
> working if OCEA changes it.
>
> **Developed without an account: feedback welcome.** Tell us on the Gladys
> forum what you see, especially if your heating is measured by heat cost
> allocators.

## What you get

One device per dwelling of your account (several if you have several), with
one feature per fluid the portal shows:

| Feature                   | Unit    | Notes                                                 |
| ------------------------- | ------- | ----------------------------------------------------- |
| Cold water                | m³      | cumulative index                                      |
| Hot water                 | m³      | cumulative index                                      |
| Heating (energy)          | kWh     | when a thermal energy meter (CETC) is fitted          |
| Heating (allocator units) | no unit | when heat cost allocators are fitted on the radiators |

**Heat meter or heat cost allocators?** A heat meter (CETC) measures the
energy your dwelling received, in kWh. Heat cost allocators, one per
radiator, measure no energy: they count **units** that only tell which share
of the building's heating bill your dwelling pays. The integration therefore
shows allocator units as a plain counter without a unit, never as kWh.

## Configuration

1. Open the **Configuration** tab of the integration.
2. Enter the **e-mail** and **password** of your OCEA resident portal. Your
   dwellings are found from the account.
3. Optionally set the **reading interval** (6 hours by default, 1 to 24) and
   the **language** used for the names of the meters.
4. Save, then open the **Discovery** tab and add your dwelling.

The **Test the connection and read now** button signs in to OCEA right away
and tells how many dwellings and meters it found.

## How often the readings change

OCEA meters send their index once, or a few times, a day. The integration
reads the portal **every 6 hours by default**, at most every hour: reading
more often brings no fresher data and only loads the portal. The last
reading is kept, so restarting Gladys does not read OCEA again before the
interval is over.

## Charts and energy monitoring

- **Water**: the index of each meter is kept in the history of the feature,
  and drawn by the device chart.
- **Heating in kWh (CETC)**: the index is an energy meter index, which the
  Gladys energy monitoring turns into a 30-minute consumption and a cost by
  itself. Gladys attaches a new energy index **under your main electric
  meter** (when one is set): in **Integrations → Energy monitoring**, set the
  heating index to **No parent (root)**, or your heating counts as part of
  your electricity. As the index arrives every few hours, the consumption of
  those hours lands in one 30-minute slot.
- **Heating in allocator units**: a history chart of the counter only. These
  units are not energy and do not enter the energy monitoring.

## Dashboard widget

The **OCEA consumption** widget shows, for the dwelling you pick, the
consumption of the current month for each fluid. It is computed by the
integration from the indexes it read: the first month only counts from the
first reading, and the widget says since when it counts.

## Limits

- Only what the portal's dashboard shows: one value per fluid, no detail per
  radiator or per meter, no alert.
- The readings are as late as OCEA's own (often the previous day).
- No account was available to build the integration: the heat cost
  allocator case in particular is based on assumptions. Your feedback helps.

## Privacy

The e-mail and the password stay in the Gladys configuration. The
integration keeps the OCEA session token and the last readings in its own
`/data` volume, and never writes credentials or tokens to its logs.

## Troubleshooting

- **"OCEA rejected the e-mail or the password"**: check them on the portal,
  then save them again. The integration stops trying until you do, so it
  never locks your account.
- **"The OCEA portal did not answer"**: OCEA may be under maintenance. The
  integration tries again in 30 minutes.
- Open the **Logs** tab of the integration to see what happened.
