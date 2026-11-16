function yamlString(value: string): string {
  return JSON.stringify(value);
}

function formatOffset(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(value);
}

function satBlock(offset: string): string {
  return `
# 10k NTC, B=3590. Voltage divider (DOWNSTREAM):
#   3.3V -- 10k resistor -- GPIO36 (VP) -- thermistor -- GND
sensor:
  - platform: adc
    id: sat_adc
    pin: GPIO36
    attenuation: 12db
    update_interval: 5s
    internal: true

  - platform: resistance
    id: sat_ohm
    name: Supply Air Temp Resistance
    sensor: sat_adc
    configuration: DOWNSTREAM
    resistor: 10kOhm
    entity_category: diagnostic

  - platform: ntc
    id: sat
    name: Supply Air Temp
    sensor: sat_ohm
    unit_of_measurement: "°C"
    accuracy_decimals: 1
    icon: mdi:thermometer
    calibration:
      b_constant: 3590
      reference_temperature: 25°C
      reference_resistance: 10kOhm
    filters:
      # ESPHome reading minus trusted thermometer (e.g. 24.0 - 21.5 = -2.5)
      - offset: ${offset}
      - sliding_window_moving_average:
          window_size: 6
          send_every: 1
      # Hold until SAT moves ±0.3 C from the last published value.
      - delta: 0.3
`;
}

function ingestLambda(includeSat: boolean): string {
  if (includeSat) {
    return `            char room[16] = "null";
            char target[16] = "null";
            char outdoor[16] = "null";
            char sat_buf[16] = "null";
            char hz[16] = "null";
            char power[16] = "null";
            if (std::isfinite(id(hp).current_temperature))
              snprintf(room, sizeof(room), "%.1f", id(hp).current_temperature);
            if (std::isfinite(id(hp).target_temperature))
              snprintf(target, sizeof(target), "%.1f", id(hp).target_temperature);
            if (std::isfinite(id(oat).state))
              snprintf(outdoor, sizeof(outdoor), "%.1f", id(oat).state);
            if (std::isfinite(id(sat).state))
              snprintf(sat_buf, sizeof(sat_buf), "%.1f", id(sat).state);
            if (std::isfinite(id(comp_hz).state))
              snprintf(hz, sizeof(hz), "%.0f", id(comp_hz).state);
            if (std::isfinite(id(input_power).state))
              snprintf(power, sizeof(power), "%.0f", id(input_power).state);
            char buf[768];
            snprintf(
                buf, sizeof(buf),
                "{\\"room_temp\\":%s,\\"target_temp\\":%s,\\"outdoor_temp\\":%s,\\"supply_air_temp\\":%s,\\"compressor_hz\\":%s,\\"input_power\\":%s,\\"mode\\":\\"%s\\",\\"hvac_action\\":\\"%s\\",\\"host\\":\\"%s\\"}",
                room, target, outdoor, sat_buf, hz, power,
                LOG_STR_ARG(climate::climate_mode_to_string(id(hp).mode)),
                LOG_STR_ARG(climate::climate_action_to_string(id(hp).action)),
                App.get_name().c_str());
            return std::string(buf);`;
  }
  return `            char room[16] = "null";
            char target[16] = "null";
            char outdoor[16] = "null";
            char hz[16] = "null";
            char power[16] = "null";
            if (std::isfinite(id(hp).current_temperature))
              snprintf(room, sizeof(room), "%.1f", id(hp).current_temperature);
            if (std::isfinite(id(hp).target_temperature))
              snprintf(target, sizeof(target), "%.1f", id(hp).target_temperature);
            if (std::isfinite(id(oat).state))
              snprintf(outdoor, sizeof(outdoor), "%.1f", id(oat).state);
            if (std::isfinite(id(comp_hz).state))
              snprintf(hz, sizeof(hz), "%.0f", id(comp_hz).state);
            if (std::isfinite(id(input_power).state))
              snprintf(power, sizeof(power), "%.0f", id(input_power).state);
            char buf[768];
            snprintf(
                buf, sizeof(buf),
                "{\\"room_temp\\":%s,\\"target_temp\\":%s,\\"outdoor_temp\\":%s,\\"compressor_hz\\":%s,\\"input_power\\":%s,\\"mode\\":\\"%s\\",\\"hvac_action\\":\\"%s\\",\\"host\\":\\"%s\\"}",
                room, target, outdoor, hz, power,
                LOG_STR_ARG(climate::climate_mode_to_string(id(hp).mode)),
                LOG_STR_ARG(climate::climate_action_to_string(id(hp).action)),
                App.get_name().c_str());
            return std::string(buf);`;
}

export function esphomeSnippet(opts: {
  slug: string;
  name: string;
  convexSiteUrl: string;
  deviceToken: string;
  includeSat?: boolean;
  satOffset?: number;
}): string {
  const includeSat = opts.includeSat === true;
  const satOffset = formatOffset(opts.satOffset ?? 0);
  // Plain HTTP on the LAN is cheap to poll every 2s. Over HTTPS each poll is
  // a TLS handshake that stalls the ESP's main loop, so poll less often.
  const plainHttp = opts.convexSiteUrl.startsWith("http://");
  const pollInterval = plainHttp ? "2s" : "10s";
  const httpTimeout = plainHttp ? "4s" : "10s";

  return `# Save as ${opts.slug}.yaml in ESPHome Device Builder.
#
# Firmware: https://github.com/echavet/MitsubishiCN105ESPHome
# Secrets live in secrets.yaml next to this file.

substitutions:
  name: ${opts.slug}
  friendly_name: ${yamlString(opts.name)}
  convex_site: ${opts.convexSiteUrl}
  device_token: ${yamlString(opts.deviceToken)}

esphome:
  name: \${name}
  friendly_name: \${friendly_name}

esp32:
  board: esp32dev
  framework:
    type: esp-idf

uart:
  id: HP_UART
  baud_rate: 2400
  parity: EVEN
  stop_bits: 1
  data_bits: 8
  tx_pin: GPIO17
  rx_pin:
    number: GPIO16
    mode:
      input: true
      pullup: true

external_components:
  - source: github://echavet/MitsubishiCN105ESPHome

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: "\${friendly_name} Fallback"
    password: !secret fallback_password

captive_portal:

api:
  encryption:
    key: !secret api_key

ota:
  platform: esphome
  password: !secret ota_password

logger:
  level: INFO

http_request:
  id: ems_http
  timeout: ${httpTimeout}
  verify_ssl: true

web_server:
  port: 80
${includeSat ? satBlock(satOffset) : ""}
climate:
  - platform: cn105
    id: hp
    name: "\${friendly_name}"
    icon: mdi:heat-pump
    update_interval: 2s
    remote_temperature_timeout: 30min
    remote_temperature_keepalive_interval: 20s
    # Indoor F/C lookup clamps outdoor air to ~31 C. Home EMS converts C/F itself.
    fahrenheit_compatibility: "disabled"
    outside_air_temperature_sensor:
      id: oat
      name: Outside Air Temp
    compressor_frequency_sensor:
      id: comp_hz
      name: Compressor Frequency
      entity_category: diagnostic
    input_power_sensor:
      id: input_power
      name: Input Power
      disabled_by_default: true
    vertical_vane_select:
      name: Vertical Vane
    isee_sensor:
      name: i-See
      entity_category: diagnostic
    stage_sensor:
      name: Stage
      entity_category: diagnostic
    sub_mode_sensor:
      name: Sub Mode
      entity_category: diagnostic
    auto_sub_mode_sensor:
      name: Auto Sub Mode
      entity_category: diagnostic
    functions_sensor:
      name: Unit Functions
      entity_category: diagnostic
    functions_get_button:
      name: Read Unit Functions
      entity_category: diagnostic
    error_code_sensor:
      name: HVAC Error
      entity_category: diagnostic

globals:
  - id: poll_backoff_until
    type: uint32_t
    restore_value: no
    initial_value: '0'
  - id: remote_sent_at
    type: uint32_t
    restore_value: no
    initial_value: '0'
  - id: remote_sent_c
    type: float
    restore_value: no
    initial_value: 'NAN'

script:
  # Telemetry. Runs every 20s and right after a command is applied.
  - id: post_state
    mode: single
    then:
      - http_request.post:
          url: \${convex_site}/ingest
          request_headers:
            Content-Type: application/json
            Authorization: Bearer \${device_token}
          body: !lambda |-
${ingestLambda(includeSat)}
  # Report twice after a command so the dashboard confirms it quickly, even
  # if the indoor unit takes a moment to echo the new state.
  - id: confirm_state
    mode: restart
    then:
      - delay: 1500ms
      - script.wait: post_state
      - script.execute: post_state
      - delay: 4s
      - script.wait: post_state
      - script.execute: post_state

  - id: poll_commands
    mode: single
    then:
      - http_request.get:
          url: \${convex_site}/commands
          capture_response: true
          max_response_buffer_size: 1kB
          request_headers:
            Authorization: Bearer \${device_token}
          on_error:
            - lambda: 'id(poll_backoff_until) = millis() + 30000;'
          on_response:
            then:
              - lambda: |-
                  if (response->status_code != 200) {
                    id(poll_backoff_until) = millis() + 30000;
                    return;
                  }
                  bool applied = false;
                  json::parse_json(body, [&applied](JsonObject root) -> bool {
                    if (!root["remote_temp"].isNull()) {
                      float remote = root["remote_temp"].as<float>();
                      uint32_t now = millis();
                      // The climate component keeps the value alive; only
                      // resend on change or once a minute.
                      if (std::isfinite(remote) && remote >= 8.0f && remote <= 39.5f &&
                          (!std::isfinite(id(remote_sent_c)) ||
                           fabsf(remote - id(remote_sent_c)) >= 0.05f ||
                           now - id(remote_sent_at) >= 60000)) {
                        id(hp).set_remote_temperature(remote);
                        id(remote_sent_c) = remote;
                        id(remote_sent_at) = now;
                      }
                    }
                    JsonArray cmds = root["commands"].as<JsonArray>();
                    if (!cmds) {
                      return true;
                    }
                    for (JsonObject cmd : cmds) {
                      auto call = id(hp).make_call();
                      const char *mode = cmd["mode"].as<const char *>();
                      if (mode) {
                        if (strcmp(mode, "off") == 0) call.set_mode(climate::CLIMATE_MODE_OFF);
                        else if (strcmp(mode, "heat") == 0) call.set_mode(climate::CLIMATE_MODE_HEAT);
                        else if (strcmp(mode, "cool") == 0) call.set_mode(climate::CLIMATE_MODE_COOL);
                        else if (strcmp(mode, "auto") == 0) call.set_mode(climate::CLIMATE_MODE_AUTO);
                        else if (strcmp(mode, "dry") == 0) call.set_mode(climate::CLIMATE_MODE_DRY);
                        else if (strcmp(mode, "fan_only") == 0) call.set_mode(climate::CLIMATE_MODE_FAN_ONLY);
                        else if (strcmp(mode, "heat_cool") == 0) call.set_mode(climate::CLIMATE_MODE_HEAT_COOL);
                      }
                      if (!cmd["target_temp"].isNull()) {
                        call.set_target_temperature(cmd["target_temp"].as<float>());
                      }
                      const char *fan = cmd["fan_mode"].as<const char *>();
                      if (fan) {
                        if (strcmp(fan, "auto") == 0) call.set_fan_mode(climate::CLIMATE_FAN_AUTO);
                        else if (strcmp(fan, "quiet") == 0) call.set_fan_mode(climate::CLIMATE_FAN_QUIET);
                        else if (strcmp(fan, "low") == 0) call.set_fan_mode(climate::CLIMATE_FAN_LOW);
                        else if (strcmp(fan, "medium") == 0) call.set_fan_mode(climate::CLIMATE_FAN_MEDIUM);
                        else if (strcmp(fan, "high") == 0) call.set_fan_mode(climate::CLIMATE_FAN_HIGH);
                      }
                      call.perform();
                      applied = true;
                    }
                    return true;
                  });
                  if (applied) {
                    id(confirm_state).execute();
                  }

interval:
  - interval: 20s
    then:
      - script.execute: post_state
  # Commands arrive within one poll of a tap. Idle polls are tiny.
  - interval: ${pollInterval}
    then:
      - if:
          condition:
            lambda: |-
              return !id(poll_commands).is_running() &&
                     (int32_t) (millis() - id(poll_backoff_until)) >= 0;
          then:
            - script.execute: poll_commands
`;
}

export function esphomeRemoteSensorSnippet(opts: {
  slug: string;
  name: string;
  convexSiteUrl: string;
  deviceToken: string;
  offset?: number;
}): string {
  const offset = formatOffset(opts.offset ?? 0);

  return `# Save as ${opts.slug}.yaml in ESPHome Device Builder.
#
# WiFi room sensor. Posts Celsius to Home EMS every 20s. The linked
# mini split applies it as CN105 remote room temperature (no extra wire).
# Secrets live in secrets.yaml next to this file.
#
# Wiring (same 10k NTC as SAT probes):
#   3.3V -- 10k resistor -- GPIO36 (VP) -- thermistor -- GND

substitutions:
  name: ${opts.slug}
  friendly_name: ${yamlString(opts.name)}
  convex_site: ${opts.convexSiteUrl}
  device_token: ${yamlString(opts.deviceToken)}

esphome:
  name: \${name}
  friendly_name: \${friendly_name}

esp32:
  board: esp32dev
  framework:
    type: esp-idf

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: "\${friendly_name} Fallback"
    password: !secret fallback_password

captive_portal:

api:
  encryption:
    key: !secret api_key

ota:
  platform: esphome
  password: !secret ota_password

logger:
  level: INFO

http_request:
  id: ems_http
  timeout: 10s
  verify_ssl: true
  follow_redirects: false

web_server:
  port: 80

sensor:
  - platform: adc
    id: room_adc
    pin: GPIO36
    attenuation: 12db
    update_interval: 5s
    internal: true

  - platform: resistance
    id: room_ohm
    name: Room Temp Resistance
    sensor: room_adc
    configuration: DOWNSTREAM
    resistor: 10kOhm
    entity_category: diagnostic

  - platform: ntc
    id: room_temp
    name: Room Temp
    sensor: room_ohm
    unit_of_measurement: "°C"
    accuracy_decimals: 1
    icon: mdi:thermometer
    calibration:
      b_constant: 3590
      reference_temperature: 25°C
      reference_resistance: 10kOhm
    filters:
      - offset: ${offset}
      - sliding_window_moving_average:
          window_size: 6
          send_every: 1
      - clamp:
          min_value: 8
          max_value: 39.5
          ignore_out_of_range: true

  - platform: wifi_signal
    name: WiFi Signal
    update_interval: 120s

interval:
  - interval: 20s
    then:
      - http_request.post:
          url: \${convex_site}/remote-temp
          request_headers:
            Content-Type: application/json
            X-Device-Token: \${device_token}
          body: !lambda |-
            char temp[16] = "null";
            if (std::isfinite(id(room_temp).state))
              snprintf(temp, sizeof(temp), "%.1f", id(room_temp).state);
            char buf[192];
            snprintf(
                buf, sizeof(buf),
                "{\\"room_temp\\":%s,\\"token\\":\\"\${device_token}\\"}",
                temp);
            return std::string(buf);
`;
}

