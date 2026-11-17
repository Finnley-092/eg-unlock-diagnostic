
(() => {
  'use strict';

  const BUILD = 'EY6-DIAGNOSTIC-v27';
  const UUID = {
    NUS_SERVICE: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    NUS_WRITE:   '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    NUS_NOTIFY:  '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    BATTERY:     '0000180f-0000-1000-8000-00805f9b34fb',
    BATTERY_LEVEL: '00002a19-0000-1000-8000-00805f9b34fb',
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
      max-width: 850px;
      margin: auto;
      padding: 18px;
    }
    .ey-card {
      background: #1b202b;
      border: 1px solid #303746;
      border-radius: 15px;
      padding: 16px;
      margin: 12px 0;
    }
    .ey-title { font-size: 25px; font-weight: 800; }
    .ey-muted { color: #aab3c2; font-size: 13px; }
    .ey-status { font-weight: 700; margin-top: 8px; }
    .ey-button {
      width: 100%;
      padding: 14px;
      margin-top: 10px;
      border: 0;
      border-radius: 11px;
      background: #477df5;
      color: white;
      font-size: 16px;
      font-weight: 700;
    }
    .ey-button.secondary { background: #343d4d; }
    .ey-button:disabled { opacity: .45; }
    .ey-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .ey-value {
      font-size: 23px;
      font-weight: 800;
      margin-top: 6px;
      overflow-wrap: anywhere;
    }
    .ey-label { color: #aab3c2; font-size: 12px; }
    .ey-log {
      background: #090c11;
      border-radius: 10px;
      padding: 12px;
      height: 260px;
      overflow-y: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 12px/1.55 monospace;
      color: #b9e6c8;
    }
    .ey-warning {
      border-left: 3px solid #e9b34e;
      padding-left: 10px;
      color: #e9d6ad;
      font-size: 13px;
    }
    @media (max-width: 420px) {
      #ey6-diagnostic-app { padding: 12px; }
      .ey-grid { grid-template-columns: 1fr 1fr; }
    }
  `;
  document.head.appendChild(style);

  root.innerHTML = `
    <div class="ey-title">EY! 6 Diagnose</div>
    <div class="ey-muted">${BUILD} · Bluetooth-Livediagnose</div>

    <div class="ey-card">
      <div class="ey-label">VERBINDUNGSSTATUS</div>
      <div class="ey-status" id="ey-status">Nicht verbunden</div>
      <div class="ey-muted" id="ey-device">Kein Roller ausgewählt</div>
      <button class="ey-button" id="ey-connect">Mit EY! 6 verbinden</button>
      <button class="ey-button secondary" id="ey-disconnect" disabled>
        Verbindung trennen
      </button>
    </div>

    <div class="ey-card">
      <strong>Messwerte</strong>
      <div class="ey-grid" style="margin-top:14px">
        <div>
          <div class="ey-label">Akku</div>
          <div class="ey-value" id="ey-battery">Nicht bestätigt</div>
        </div>
        <div>
          <div class="ey-label">Geschwindigkeit</div>
          <div class="ey-value" id="ey-speed">Nicht bestätigt</div>
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
      <strong>Empfangene Daten</strong>
      <div class="ey-muted" id="ey-packets">0 Pakete empfangen</div>
      <div class="ey-muted" style="margin:8px 0">
        Rohdaten werden angezeigt. Unbestätigte Werte werden nicht geraten.
      </div>
      <div class="ey-log" id="ey-log">Warte auf Verbindung …</div>
      <button class="ey-button secondary" id="ey-clear">Protokoll leeren</button>
    </div>

    <div class="ey-card">
      <strong>Hinweis</strong>
      <p class="ey-warning">
        Diese Version liest Diagnoseinformationen. Sie verändert weder
        Geschwindigkeitseinstellungen noch Controller- oder Firmwaredaten.
        Akku- und Geschwindigkeitswerte bleiben ausgeblendet, bis ihre
        Bedeutung sicher bestätigt wurde.
      </p>
    </div>
  `;

  const $ = id => document.getElementById(id);

  function log(message) {
    const time = new Date().toLocaleTimeString();
    const box = $('ey-log');
    box.textContent += `[${time}] ${message}\n`;
    box.scrollTop = box.scrollHeight;
  }

  function hex(bytes) {
    return Array.from(bytes)
      .map(v => Number(v).toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
  }

  function setStatus(message) {
    $('ey-status').textContent = message;
  }

  function updatePacketCount() {
    $('ey-packets').textContent =
      `${packetCount} Pakete empfangen`;
  }

  function resetValues() {
    $('ey-battery').textContent = 'Nicht bestätigt';
    $('ey-speed').textContent = 'Nicht bestätigt';
    $('ey-gear').textContent = 'Unbekannt';
    $('ey-light').textContent = 'Unbekannt';
  }

  function parseFrames() {
    while (receiveBuffer.length >= 7) {
      let start = -1;

      for (let i = 0; i < receiveBuffer.length - 1; i++) {
        if (receiveBuffer[i] === 0x5a &&
            receiveBuffer[i + 1] === 0xb3) {
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

      const payloadLength = receiveBuffer[4];
      const frameLength = payloadLength + 7;

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

  function handleFrame(frame) {
    packetCount++;
    updatePacketCount();

    log(`RX (${frame.length} Bytes): ${hex(frame)}`);

    if (frame[0] !== 0x5a || frame[1] !== 0xb3) {
      log('Unbekannter Paketanfang');
      return;
    }

    const functionId = frame[2];
    const declaredLength = frame[4];
    const data = frame.slice(5, 5 + declaredLength);

    log(
      `Funktion: 0x${functionId.toString(16).padStart(2, '0').toUpperCase()}`
    );
    log(`Nutzdaten (${data.length} Bytes): ${hex(data)}`);

    if (functionId !== 0x01 || data.length < 6) {
      log('Keine vollständig bekannte Basisdaten-Antwort');
      return;
    }

    const gearCandidate = data[3] & 7;
    const statusByte = data[5];

    log('Erkannte Kandidaten:');
    log(`  Byte 0: ${data[0]}`);
    log(`  Geschwindigkeitsbytes: ${data[1]}, ${data[2]}`);
    log(`  Fahrstufen-Kandidat: ${gearCandidate}`);
    log(`  Statusbyte: 0x${statusByte.toString(16).padStart(2, '0')}`);
    log(`  Lichtbit-Kandidat: ${(statusByte & 0x08) ? 'AN' : 'AUS'}`);

    const gearNames = {
      1: 'Eco (Kandidat)',
      2: 'Drive (Kandidat)',
      3: 'Sport (Kandidat)'
    };

    $('ey-gear').textContent =
      gearNames[gearCandidate] || `Wert ${gearCandidate}`;

    $('ey-light').textContent =
      (statusByte & 0x08) ? 'AN (Kandidat)' : 'AUS (Kandidat)';

    // Akku und Geschwindigkeit werden nicht als Messwerte ausgegeben,
    // weil ihre Bedeutung bisher nicht unabhängig bestätigt wurde.
    $('ey-battery').textContent = 'Noch unbestätigt';
    $('ey-speed').textContent = 'Noch unbestätigt';
  }

  function onNotification(event) {
    const value = event.target.value;
    const bytes = Array.from(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
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
      setStatus('Bluetooth wird von diesem Browser nicht unterstützt');
      log('Web Bluetooth API nicht verfügbar.');
      return;
    }

    try {
      $('ey-connect').disabled = true;
      setStatus('Bluetooth-Gerät auswählen …');

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

      device.addEventListener('gattserverdisconnected', onDisconnected);

      setStatus('Verbinde …');
      server = await device.gatt.connect();

      const service = await server.getPrimaryService(UUID.NUS_SERVICE);

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
      setStatus('Verbunden – warte auf Daten');
      log('NUS-Service erfolgreich verbunden.');
      log('Notify-Kanal aktiviert.');
      log('Sende einmalige Basisdaten-Abfrage …');

      await sendBasicQuery();

    } catch (error) {
      setStatus('Verbindung fehlgeschlagen');
      log(`FEHLER: ${error.name || 'Error'}: ${error.message}`);
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
      log('Abfrage gesendet. Warte auf Antwort …');
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

    setStatus('Nicht verbunden');
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

  $('ey-connect').addEventListener('click', connect);
  $('ey-disconnect').addEventListener('click', disconnect);

  $('ey-clear').addEventListener('click', () => {
    $('ey-log').textContent = '';
    packetCount = 0;
    updatePacketCount();
  });

  resetValues();
  updatePacketCount();

  log(`Diagnoseprogramm gestartet: ${BUILD}`);
  log('Bereit. Es werden nur bekannte Diagnosekanäle verwendet.');
})();
