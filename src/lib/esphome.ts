export function esphomeSnippet(opts: {
  slug: string;
  name: string;
  convexSiteUrl: string;
  deviceToken: string;
}): string {
  return `substitutions:
  name: ${opts.slug}
  friendly_name: "${opts.name}"
  convex_site: ${opts.convexSiteUrl}
  device_token: "${opts.deviceToken}"

# Copy into ESPHome, then add wifi / api / ota secrets.
# Full annotated example: esphome/unit.example.yaml

esp32:
  board: esp32-s3-devkitc-1
  framework:
    type: esp-idf

external_components:
  - source: github://echavet/MitsubishiCN105ESPHome

http_request:
  timeout: 10s

climate:
  - platform: cn105
    id: hp
    name: \${friendly_name}
    update_interval: 2s
    outside_air_temperature_sensor:
      id: oat
      name: Outside Air Temp
    compressor_frequency_sensor:
      id: comp_hz
      name: Compressor Frequency

interval:
  - interval: 20s
    then:
      - http_request.post:
          url: \${convex_site}/ingest
          request_          request_headers:
            Content-Type: application/json
            Authorization: Bearer \${device_token}
          body: !lambda |-
            char buf[768];
            snprintf(buf, sizeof(buf),
              "{\\"slug\\":\\"${opts.slug}\\",\\"room_temp\\":%.1f,\\"target_temp\\":%.1f,\\"outdoor_temp\\":%.1f,\\"compressor_hz\\":%.0f,\\"mode\\":\\"%s\\",\\"hvac_action\\":\\"%s\\"}",
              id(hp).current_temperature,
              id(hp).target_temperature,
              id(oat).state,
              id(comp_hz).state,
              LOG_STR_ARG(climate::climate_mode_to_string(id(hp).mode)),
              LOG_STR_ARG(climate::climate_action_to_string(id(hp).action)));
            return std::string(buf);
`;
}
