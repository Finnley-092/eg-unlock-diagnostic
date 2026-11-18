
(() => {
  'use strict';

  const BUILD = 'EY6-DIAGNOSTIC-v28';

  const UUID = {
    NUS_SERVICE: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    NUS_WRITE: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    NUS_NOTIFY: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    BATTERY: '0000180f-0000-1000-8000-00805f9b34fb',
    DEVICE_INFO: '0000180a-0000-1000-8000-00805f9b34fb',
    FFC_SERVICE: '0000ffc0-0000-1000-8000-00805f9b34fb'
  };

  const QUERY_BASIC_DATA = [
    0x50, 0x28, 0x0e, 0x0f, 0x0c,
    0x4f, 0x50, 0x71, 0xa0
  ];

  let device = null;
  let server = null;
  let txCharacteristic = null;
  let rxCharacteristic = null;

  let receiveBuffer = [];
  let packetCount = 0;
  let connected = false;

  let history = [];
  let previousPayload = null;
  let byteChanges = Array(10).fill(0);
  let lastPacketAt = null;

  const root = document.createElement('div');
  root.id = 'ey6-diagnostic-app';

  document.body.innerHTML = '';
  document.body.appendChild(root);

  const style = document.createElement('style');

  style.textContent = `
    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: #10131a;
      color: #f3f5fa;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }

    #ey6-diagnostic-app {
      max-width: 900px;
      margin: auto;
      padding: 16px;
    }

    .ey-card {
      background: #1b202b;
      border: 1px solid #303746;
      border-radius: 15px;
      padding: 15px;
      margin: 12px 0;
    }

    .ey-title {
      font-size: 25px;
      font-weight: 800;
    }

    .ey-muted {
      color: #aab3c2;
      font-size: 13px;
    }

    .ey-status {
      font-weight: 700;
      margin-top: 8px;
    }

    .ey-button {
      width: 100%;
      padding: 13px;
      margin-top: 9px;
      border: 0;
      border-radius: 11px;
      background: #477df5;
      color: white;
      font-size: 15px;
      font-weight: 700;
    }

    .ey-button.secondary {
      background: #343d4d;
    }

    .ey-button:disabled {
      opacity: .45;
    }

    .ey-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 13px;
    }

    .ey-label {
      color: #aab3c2;
      font-size: 12px;
    }

    .ey-value {
      font-size: 22px;
      font-weight: 800;
      margin-top: 5px;
      overflow-wrap: anywhere;
    }

    .ey-log {
      background: #090c11;
      border-radius: 10px;
      padding: 11px;
      height: 210px;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 12px/1.5 monospace;
      color: #b9e6c8;
    }

    .ey-warning {
      border-left: 3px solid #e9b34e;
      padding-left: 10px;
      color: #e9d6ad;
      font-size: 13px;
    }

    .ey-table-wrap {
      overflow-x: auto;
      margin-top: 10px;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      font: 13px monospace;
      min-width: 330px;
    }

    th, td {
      text-align: left;
      padding: 8px 6px;
      border-bottom: 1px solid #303746;
    }

    th {
      color: #aab3c2;
      font-weight: 600;
    }

    .ey-good { color: #8fe0a6; }
    .ey-bad { color: #ff9b9b; }

    .ey-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    @media(max-width:420px) {
      #ey6-diagnostic-app { padding: 11px; }
      .ey-grid { gap: 8px; }
      .ey-value { font-size: 19px; }
    }
  `;

  document.head.appendChild(style);

  root.innerHTML = `
    <div class="ey-title">EY! 6 Diagnose</div>
    <div class="ey-muted">${BUILD} · Bluetooth-Livediagnose</div>

    <div class="ey-card">
      <div class="ey-label">VERBINDUNGSSTATUS</div>
      <div class="ey-status" id="ey-status">Nicht verbunden</div>
      <div class="ey-muted" id="ey-device">
        Kein Roller ausgewählt
      </div>

      <button class="ey-button" id="ey-connect">
        Mit EY! 6 verbinden
      </button>

      <button class="ey-button secondary" id="ey-disconnect" disabled>
        Verbindung trennen
      </button>
    </div>

    <div class="ey-card">
      <strong>Messwerte</strong>

      <div class="ey-grid">
        <div>
          <div class="ey-label">Akku (bestätigt)</div>
          <div class="ey-value" id="ey-battery">—</div>
        </div>

        <div>
          <div class="ey-label">Geschwindigkeit</div>
          <div class="ey-value" id="ey-speed">
            Nicht entschlüsselt
          </div>
        </div>

        <div>
          <div class="ey-label">Fahrstufe</div>
          <div class="ey-value" id="ey-gear">Unbekannt</div>
        </div>

        <div>
          <div class="ey-label">Licht</div>
          <div class="ey-value" id="ey-light">Unbekannt</div>
        </div>
      </div>
    </div>

    <div class="ey-card">
      <strong>Letztes Datenpaket</strong>

      <div class="ey-grid">
        <div>
          <div class="ey-label">Pakete insgesamt</div>
          <div class="ey-value" id="ey-packets">0</div>
        </div>

        <div>
          <div class="ey-label">Paketabstand</div>
          <div class="ey-value" id="ey-gap">—</div>
        </div>

        <div>
          <div class="ey-label">Zeitpunkt</div>
          <div class="ey-value" id="ey-time">—</div>
        </div>

        <div>
          <div class="ey-label">CRC16/XMODEM</div>
          <div class="ey-value" id="ey-crc">—</div>
        </div>
      </div>
    </div>

    <div class="ey-card">
      <strong>Byte-Analyse der Nutzdaten</strong>

      <div class="ey-muted">
        Letzte 10 Nutzdaten-Bytes.
        Die Zähler zeigen Änderungen zwischen Paketen.
      </div>

      <div class="ey-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Byte</th>
              <th>Hex</th>
              <th>Dezimal</th>
              <th>Änderungen</th>
            </tr>
          </thead>

          <tbody id="ey-byte-rows">
            <tr>
              <td colspan="4">Noch keine Daten</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="ey-card">
      <strong>Aufzeichnung</strong>

      <div class="ey-muted" id="ey-history-count">
        0 von 500 Paketen gespeichert
      </div>

      <div class="ey-actions">
        <button class="ey-button" id="ey-export">
          CSV exportieren
        </button>

        <button class="ey-button secondary" id="ey-reset">
          Aufzeichnung zurücksetzen
        </button>
      </div>
    </div>

    <div class="ey-card">
      <strong>Empfangsprotokoll</strong>

      <div class="ey-log" id="ey-log">
        Warte auf Verbindung …
      </div>

      <button class="ey-button secondary" id="ey-clear">
        Protokoll leeren
      </button>
    </div>

    <div class="ey-card">
      <strong>Hinweis</strong>

      <p class="ey-warning">
        Die App liest Diagnoseinformationen und sendet nur
        die bekannte Basisdaten-Abfrage beim Verbinden.
        Sie verändert keine Geschwindigkeitseinstellungen,
        Controller- oder Firmwaredaten.
        Geschwindigkeit, Spannung und Strom bleiben ausgeblendet,
        solange ihre Bedeutung nicht sicher bestätigt ist.
      </p>
    </div>
  `;

  const $ = id => document.getElementById(id);

  function log(message) {
    const box = $('ey-log');

    box.textContent +=
      `[${new Date().toLocaleTimeString()}] ${message}\n`;

    box.scrollTop = box.scrollHeight;
  }

  function hex(bytes) {
    return Array.from(bytes, v =>
      Number(v).toString(16).padStart(2, '0').toUpperCase()
    ).join(' ');
  }

  function crc16Xmodem(bytes) {
    let crc = 0;

    for (const byte of bytes) {
      crc ^= byte << 8;

      for (let i = 0; i < 8; i++) {
        crc = (crc & 0x8000)
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
      }
    }

    return crc;
  }

  function updateCounts() {
    $('ey-packets').textContent = String(packetCount);

    $('ey-history-count').textContent =
      `${history.length} von 500 Paketen gespeichert`;
  }

  function renderBytes(data) {
    const rows = $('ey-byte-rows');

    rows.innerHTML = '';

    data.forEach((value, i) => {
      const tr = document.createElement('tr');

      const values = [
        String(i),
        '0x' + value.toString(16).padStart(2, '0').toUpperCase(),
        String(value),
        String(byteChanges[i])
      ];

      values.forEach(value => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });

      rows.appendChild(tr);
    });
  }

  function handleFrame(frame) {
    packetCount++;

    const now = Date.now();

    const gap = lastPacketAt === null
      ? null
      : now - lastPacketAt;

    lastPacketAt = now;

    $('ey-time').textContent =
      new Date(now).toLocaleTimeString();

    $('ey-gap').textContent =
      gap === null ? 'Erstes Paket' : `${gap} ms`;

    log(`RX (${frame.length} Bytes): ${hex(frame)}`);

    if (frame[0] !== 0x5a || frame[1] !== 0xb3) {
      log('Unbekannter Paketanfang');
      updateCounts();
      return;
    }

    const declaredLength = frame[4];

    const data = frame.slice(
      5,
      5 + declaredLength
    );

    const expectedCrc =
      (frame[frame.length - 2] << 8) |
      frame[frame.length - 1];

    const actualCrc =
      crc16Xmodem(frame.slice(0, -2));

    const crcOk = actualCrc === expectedCrc;

    $('ey-crc').textContent =
      crcOk ? 'OK' : 'Abweichung';

    $('ey-crc').className =
      'ey-value ' + (crcOk ? 'ey-good' : 'ey-bad');

    log(
      `CRC16/XMODEM: berechnet 0x${actualCrc
        .toString(16).padStart(4, '0').toUpperCase()}, ` +
      `empfangen 0x${expectedCrc
        .toString(16).padStart(4, '0').toUpperCase()} – ` +
      `${crcOk ? 'OK' : 'abweichend'}`
    );

    if (
      previousPayload &&
      data.length === previousPayload.length
    ) {
      data.forEach((value, i) => {
        if (value !== previousPayload[i]) {
          byteChanges[i]++;
        }
      });
    }

    previousPayload = data.slice();

    renderBytes(data);

    if (frame[2] === 0x01 && data.length >= 6) {
      // data[0] wurde mit der Rolleranzeige verglichen.
      $('ey-battery').textContent =
        data[0] <= 100 ? `${data[0]} %` : 'Ungültiger Wert';

      const gear = data[3] & 7;

      $('ey-gear').textContent = ({
        1: 'Eco (Kandidat)',
        2: 'Drive (Kandidat)',
        3: 'Sport (Kandidat)'
      })[gear] || `Wert ${gear}`;

      $('ey-light').textContent =
        (data[5] & 0x08)
          ? 'AN (Kandidat)'
          : 'AUS (Kandidat)';

      $('ey-speed').textContent = 'Nicht entschlüsselt';

      log(
        `Akku: ${data[0]} % · ` +
        `Fahrstufen-Kandidat: ${gear} · ` +
        `Lichtbit-Kandidat: ${(data[5] & 8) ? 'AN' : 'AUS'}`
      );
    }

    history.push({
      time: new Date(now).toISOString(),
      gap_ms: gap,
      frame_hex: hex(frame),
      payload_hex: hex(data),
      payload_dec: data.join(','),
      crc_ok: crcOk
    });

    if (history.length > 500) {
      history.shift();
    }

    updateCounts();
  }

  function parseFrames() {
    while (receiveBuffer.length >= 7) {
      let start = -1;

      for (let i = 0; i < receiveBuffer.length - 1; i++) {
        if (
          receiveBuffer[i] === 0x5a &&
          receiveBuffer[i + 1] === 0xb3
        ) {
          start = i;
          break;
        }
      }

      if (start < 0) {
        receiveBuffer = receiveBuffer.slice(-1);
        return;
      }

      if (start > 0) {
        receiveBuffer = receiveBuffer.slice(start);
      }

      if (receiveBuffer.length < 5) return;

      const frameLength = receiveBuffer[4] + 7;

      if (frameLength < 7 || frameLength > 128) {
        log('Ungültige Paketlänge – Synchronisierung neu gestartet');
        receiveBuffer.shift();
        continue;
      }

      if (receiveBuffer.length < frameLength) return;

      const frame = receiveBuffer.slice(0, frameLength);

      receiveBuffer = receiveBuffer.slice(frameLength);

      handleFrame(frame);
    }
  }

  function onNotification(event) {
    const value = event.target.value;

    const bytes = Array.from(
      new Uint8Array(
        value.buffer,
        value.byteOffset,
        value.byteLength
      )
    );

    log(`Notify: ${hex(bytes)}`);

    receiveBuffer.push(...bytes);

    if (receiveBuffer.length > 512) {
      receiveBuffer = receiveBuffer.slice(-256);
      log('Empfangspuffer begrenzt');
    }

    parseFrames();
  }

  async function connect() {
    if (!navigator.bluetooth) {
      $('ey-status').textContent =
        'Bluetooth wird nicht unterstützt';

      log('Web Bluetooth API nicht verfügbar.');
      return;
    }

    try {
      $('ey-connect').disabled = true;

      $('ey-status').textContent =
        'Bluetooth-Gerät auswählen …';

      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'escooter' }],
        optionalServices: [
          UUID.NUS_SERVICE,
          UUID.BATTERY,
          UUID.DEVICE_INFO,
          UUID.FFC_SERVICE
        ]
      });

      $('ey-device').textContent =
        device.name || 'Unbekanntes Gerät';

      device.addEventListener(
        'gattserverdisconnected',
        onDisconnected
      );

      $('ey-status').textContent = 'Verbinde …';

      server = await device.gatt.connect();

      const service =
        await server.getPrimaryService(UUID.NUS_SERVICE);

      txCharacteristic =
        await service.getCharacteristic(UUID.NUS_WRITE);

      rxCharacteristic =
        await service.getCharacteristic(UUID.NUS_NOTIFY);

      await rxCharacteristic.startNotifications();

      rxCharacteristic.addEventListener(
        'characteristicvaluechanged',
        onNotification
      );

      connected = true;

      $('ey-disconnect').disabled = false;

      $('ey-status').textContent =
        'Verbunden – empfange Daten';

      log('NUS-Service verbunden; Notify-Kanal aktiviert.');

      await sendBasicQuery();

    } catch (error) {
      $('ey-status').textContent =
        'Verbindung fehlgeschlagen';

      log(
        `FEHLER: ${error.name || 'Error'}: ${error.message}`
      );

      $('ey-connect').disabled = false;
      connected = false;
    }
  }

  async function sendBasicQuery() {
    if (!txCharacteristic || !connected) return;

    try {
      const data = new Uint8Array(QUERY_BASIC_DATA);

      if (txCharacteristic.writeValueWithResponse) {
        await txCharacteristic.writeValueWithResponse(data);
      } else if (txCharacteristic.writeValue) {
        await txCharacteristic.writeValue(data);
      } else {
        throw new Error('Schreibfunktion nicht verfügbar');
      }

      log(`TX Basisdaten-Abfrage: ${hex(data)}`);

    } catch (error) {
      log(`Abfrage fehlgeschlagen: ${error.message}`);
    }
  }

  function onDisconnected() {
    connected = false;

    txCharacteristic = null;
    rxCharacteristic = null;
    server = null;
    receiveBuffer = [];

    $('ey-status').textContent = 'Nicht verbunden';

    $('ey-connect').disabled = false;
    $('ey-disconnect').disabled = true;

    log('Bluetooth-Verbindung getrennt.');
  }

  async function disconnect() {
    try {
      if (rxCharacteristic) {
        await rxCharacteristic.stopNotifications();
      }
    } catch (_) {}

    if (device && device.gatt && device.gatt.connected) {
      device.gatt.disconnect();
    } else {
      onDisconnected();
    }
  }

  function csvEscape(value) {
    return '"' +
      String(value ?? '').replace(/"/g, '""') +
      '"';
  }

  function exportCsv() {
    if (!history.length) {
      log('Noch keine Pakete zum Exportieren vorhanden.');
      return;
    }

    const columns = [
      'time',
      'gap_ms',
      'frame_hex',
      'payload_hex',
      'payload_dec',
      'crc_ok'
    ];

    const lines = [
      columns.join(','),
      ...history.map(row =>
        columns.map(column =>
          csvEscape(row[column])
        ).join(',')
      )
    ];

    const blob = new Blob(
      ['\uFEFF' + lines.join('\r\n')],
      { type: 'text/csv;charset=utf-8' }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;
    a.download = 'ey6-diagnose-v28.csv';

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    log(`${history.length} Pakete als CSV exportiert.`);
  }

  function resetHistory() {
    history = [];
    byteChanges = Array(10).fill(0);
    previousPayload = null;
    lastPacketAt = null;

    $('ey-byte-rows').innerHTML =
      '<tr><td colspan="4">Aufzeichnung zurückgesetzt</td></tr>';

    $('ey-gap').textContent = '—';
    $('ey-time').textContent = '—';
    $('ey-crc').textContent = '—';

    $('ey-crc').className = 'ey-value';

    updateCounts();

    log('Aufzeichnung und Änderungszähler zurückgesetzt.');
  }

  $('ey-connect').addEventListener('click', connect);
  $('ey-disconnect').addEventListener('click', disconnect);
  $('ey-export').addEventListener('click', exportCsv);
  $('ey-reset').addEventListener('click', resetHistory);

  $('ey-clear').addEventListener('click', () => {
    $('ey-log').textContent = '';
  });

  updateCounts();

  log(`Diagnoseprogramm gestartet: ${BUILD}`);
  log('Bereit. Es wird nur die bekannte Basisdaten-Abfrage verwendet.');

})();
