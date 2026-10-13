# OCEA Smart Building for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration that
reads the meters of your dwelling from the **OCEA Smart Building resident
portal** (<https://espace-resident.ocea-sb.com>): cold water, hot water and
heating, in buildings whose meters OCEA reads remotely.

> **Not affiliated with OCEA Smart Building.** This is an independent,
> community project. OCEA publishes no public API: the integration talks to
> the resident portal the way its web application does, and may break when
> OCEA changes it.
>
> **Developed without an account: feedback welcome.** No OCEA account was
> available while building it; the protocol comes from the open-source
> projects credited below. Reports from real dwellings, in particular with
> heat cost allocators, are very welcome.

User documentation: [English](docs/en.md) · [Français](docs/fr.md).

## What it does

- Signs in with the e-mail and password of the resident portal (Azure AD B2C,
  no browser), keeps the session and renews its token by itself.
- Finds the dwellings of the account and publishes **one device per
  dwelling**, with one feature per fluid the portal reports:

  | Fluid                         | Gladys feature               | Unit    |
  | ----------------------------- | ---------------------------- | ------- |
  | Cold water, hot water         | `volume-sensor` / `decimal`  | m³      |
  | Heating, energy meter (CETC)  | `energy-sensor` / `index`    | kWh     |
  | Heating, heat cost allocators | `counter-sensor` / `integer` | no unit |

  A CETC measures energy: its index feeds the Gladys energy monitoring,
  which derives the 30-minute consumption and its cost by itself. Heat cost
  allocator units are dimensionless (a share of the building's heating bill,
  not energy): they are published as a plain counter and never enter the
  energy monitoring.

- Reads the portal on its own timer, **every 6 hours by default** (1 to 24
  hours): OCEA meters report once or a few times a day, there is nothing to
  gain from reading more often. Only changed values are published, and the
  last reading is kept in `/data` for restarts.
- A dashboard widget, **OCEA consumption**, shows the consumption of the
  current month per fluid.

What it does not do: no per-radiator or per-meter detail (the portal's
dashboard gives one value per fluid), no scene trigger (OCEA gives no
alert to forward).

## Project structure

```
index.js                     SDK wiring only
src/app.js                   handlers, timer, publication of devices and states
src/ocea/auth.js             Azure AD B2C sign-in and token refresh
src/ocea/client.js           resident API client, session kept under /data
src/ocea/http.js             cookie jar and manual redirects
src/ocea/parse.js            OCEA answers -> readings (fluid, kind, unit, value)
src/devices.js               readings -> Gladys devices and states
src/history.js               start-of-month indexes for the widget
src/widgets.js               the dashboard widget
src/i18n.js                  every text, in English, French, German, Spanish
src/redact.js                masks credentials and tokens in the logs
test/                        node --test, against the SDK's fake Gladys and a fake OCEA
test/fixtures/ocea/          anonymized OCEA answers
```

## Development

```bash
npm install
npm test               # node --test
npm run lint           # ESLint
npm run format:check   # Prettier
npx -y github:GladysAssistant/integration-store .   # store checks
```

The tests never touch the network: `test/helpers/fake-ocea.js` plays the
B2C sign-in (cookies, CSRF, PKCE) and the resident API.
`test/gladys-rules.test.js` checks every device the integration can publish
against the table of the Gladys core (`test/fixtures/gladys-feature-table.json`).

Releases go through **Actions → Release** (see `CHANGELOG.md`); never edit
`version` by hand.

## Credits

- **[Triskae/ha_ocea_smart_building](https://github.com/Triskae/ha_ocea_smart_building)**
  (Home Assistant, MIT License): the browser-less Azure AD B2C sign-in and
  the `dashboard/consos` endpoint. `src/ocea/auth.js` is a Node.js port of its
  authentication flow; its license is reproduced in
  [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- **[sywesk/ocea-exporter](https://github.com/sywesk/ocea-exporter)**
  (Go): read to understand the resident API (dwellings, fluids, heating). It
  has no license, so none of its code is reused here.

## License

Apache-2.0, see the license field of `package.json`. Third-party notices:
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
