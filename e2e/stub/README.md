# Weatherstack stub (e2e only)

`server.ts` stands in for Weatherstack in the e2e stack. `docker-compose.e2e.yml` runs it as
the `weather-stub` service and points the API's `WEATHERSTACK_BASE_URL` at it, with a
placeholder key. The real key is never sent to it.

| Request                                             | Response                                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /current`, `query` contains `QUOTA` (any case) | HTTP 200, error body `code: 104` → the API returns `WEATHER_QUOTA_EXCEEDED`                                       |
| `GET /current`, any other `query`                   | HTTP 200, `docs/samples/weatherstack-current.json` (Fountain Hills, region `Arizona`) with `request.query` echoed |
| `GET /healthz`                                      | HTTP 200 (Compose healthcheck)                                                                                    |
| anything else                                       | HTTP 404                                                                                                          |

The API puts the street into `query`, so a spec triggers a case through the street field. A
create that should succeed uses state `AZ`, because the sample's region is Arizona (FR-05 AC4).

To add a trigger, add a branch to `currentBody` and a row here.
