import { BleManager, ScanMode } from 'react-native-ble-plx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../constants/Supabase';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Buffer } from 'buffer';
if (!global.Buffer) {
  global.Buffer = Buffer;
}
import mqtt from 'mqtt/dist/mqtt';

const BACKGROUND_BLE_TASK = 'background-ble-scan-task';
const MINEW_SERVICE_UUIDS = [
  '0000feaa-0000-1000-8000-00805f9b34fb', // Eddystone
  '0000ffe1-0000-1000-8000-00805f9b34fb', // Info / Ráfagas
  '0000fff1-0000-1000-8000-00805f9b34fb', // Trigger / Presencia
  '00007f28-0000-1000-8000-00805f9b34fb'  // Configuración
];
const DEBOUNCE_TIME_MS = 90000; // 90 segundos para evitar doble disparo mientras el llavero anuncia
let bleManagerInstance = null;
let isScanning = false;
const lastInfoPackets = {};
const lastTriggerPackets = {};
let scanTimeoutId = null;
const lastTriggerTimesMemory = {};
let lastBackgroundLocation = null;

function base64ToBytes(base64) {
  if (!base64) return null;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < base64.length; i++) {
    const char = base64[i];
    if (char === '=') break;
    const value = chars.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

// Generación determinista de UUIDv5 a partir de un string
function sha1(str) {
  var blockstart,
      i,
      j,
      W = new Array(80),
      H0 = 0x67452301,
      H1 = 0xEFCDAB89,
      H2 = 0x98BADCFE,
      H3 = 0x10325476,
      H4 = 0xC3D2E1F0,
      A, B, C, D, E,
      temp,
      words = [],
      utf8 = [];
  for (i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 128) {
      utf8.push(c);
    } else if (c < 2048) {
      utf8.push((c >> 6) | 192, (c & 63) | 128);
    } else {
      utf8.push((c >> 12) | 224, ((c >> 6) & 63) | 128, (c & 63) | 128);
    }
  }
  var messageLength = utf8.length;
  var numberOfWords = (((messageLength + 8) >> 6) + 1) << 4;
  for (i = 0; i < numberOfWords; i++) {
    words[i] = 0;
  }
  for (i = 0; i < messageLength; i++) {
    words[i >> 2] |= utf8[i] << (24 - (i % 4) * 8);
  }
  words[messageLength >> 2] |= 0x80 << (24 - (messageLength % 4) * 8);
  words[numberOfWords - 1] = messageLength * 8;
  for (blockstart = 0; blockstart < numberOfWords; blockstart += 16) {
    for (i = 0; i < 16; i++) W[i] = words[blockstart + i];
    for (i = 16; i < 80; i++) {
      temp = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16];
      W[i] = (temp << 1) | (temp >>> 31);
    }
    A = H0; B = H1; C = H2; D = H3; E = H4;
    for (i = 0; i < 80; i++) {
      var f, k;
      if (i < 20) {
        f = (B & C) | ((~B) & D);
        k = 0x5A827999;
      } else if (i < 40) {
        f = B ^ C ^ D;
        k = 0x6ED9EBA1;
      } else if (i < 60) {
        f = (B & C) | (B & D) | (C & D);
        k = 0x8F1BBCDC;
      } else {
        f = B ^ C ^ D;
        k = 0xCA62C1D6;
      }
      temp = ((A << 5) | (A >>> 27)) + f + E + k + W[i];
      E = D; D = C;
      C = (B << 30) | (B >>> 2);
      B = A; A = temp;
    }
    H0 = (H0 + A) & 0xffffffff;
    H1 = (H1 + B) & 0xffffffff;
    H2 = (H2 + C) & 0xffffffff;
    H3 = (H3 + D) & 0xffffffff;
    H4 = (H4 + E) & 0xffffffff;
  }
  var hash = [H0, H1, H2, H3, H4];
  var hex = "";
  for (i = 0; i < 5; i++) {
    for (j = 24; j >= 0; j -= 8) {
      var v = (hash[i] >> j) & 0xff;
      hex += v.toString(16).padStart(2, '0');
    }
  }
  return hex;
}

function generateDeterministicUUID(userId, deviceMac, timeBucket) {
  const rawString = `${userId}_${deviceMac}_${timeBucket}`;
  const hex = sha1(rawString);
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
}

export const getBleManager = () => {
  if (!bleManagerInstance) {
    bleManagerInstance = new BleManager();
  }
  return bleManagerInstance;
};

// Guardar la configuración del llavero en la lista
export const saveLinkedBeacon = async (macAddress, alertType) => {
  try {
    const list = await getLinkedBeacons();
    const formattedMac = macAddress.toUpperCase();
    const existingIndex = list.findIndex(b => b.macAddress.toUpperCase() === formattedMac);
    if (existingIndex > -1) {
      list[existingIndex].alertType = alertType;
    } else {
      list.push({ macAddress: formattedMac, alertType });
    }
    await AsyncStorage.setItem('@veci_linked_beacons', JSON.stringify(list));

    // Mantener compatibilidad con llamadas de un solo llavero (guardando el último configurado)
    await AsyncStorage.setItem('@veci_beacon_mac', formattedMac);
    await AsyncStorage.setItem('@veci_beacon_alert_type', JSON.stringify(alertType));

    console.log(`DEBUG: 💾 Llavero guardado en lista: ${formattedMac} con alerta ${alertType?.name || 'PANICO'}. Total: ${list.length}`);
  } catch (e) {
    console.error('Error al guardar llavero:', e);
  }
};

// Obtener la lista de todos los llaveros vinculados
export const getLinkedBeacons = async () => {
  try {
    const listStr = await AsyncStorage.getItem('@veci_linked_beacons');
    if (listStr) {
      return JSON.parse(listStr);
    }
    // Migrar datos viejos si existen
    const oldMac = await AsyncStorage.getItem('@veci_beacon_mac');
    const oldTypeStr = await AsyncStorage.getItem('@veci_beacon_alert_type');
    if (oldMac) {
      const list = [{
        macAddress: oldMac,
        alertType: oldTypeStr ? JSON.parse(oldTypeStr) : null
      }];
      await AsyncStorage.setItem('@veci_linked_beacons', JSON.stringify(list));
      return list;
    }
    return [];
  } catch (e) {
    console.error('Error al obtener llaveros vinculados:', e);
    return [];
  }
};

// Eliminar un llavero de la lista
export const removeLinkedBeacon = async (macAddress) => {
  try {
    const list = await getLinkedBeacons();
    const formattedMac = macAddress.toUpperCase();
    const updatedList = list.filter(b => b.macAddress.toUpperCase() !== formattedMac);
    await AsyncStorage.setItem('@veci_linked_beacons', JSON.stringify(updatedList));

    if (updatedList.length > 0) {
      await AsyncStorage.setItem('@veci_beacon_mac', updatedList[0].macAddress);
      await AsyncStorage.setItem('@veci_beacon_alert_type', JSON.stringify(updatedList[0].alertType));
    } else {
      await AsyncStorage.removeItem('@veci_beacon_mac');
      await AsyncStorage.removeItem('@veci_beacon_alert_type');
    }
    console.log(`DEBUG: 🗑️ Llavero eliminado: ${formattedMac}. Restantes: ${updatedList.length}`);
  } catch (e) {
    console.error('Error al eliminar llavero:', e);
  }
};

// Obtener la configuración del llavero (compatible con firmas antiguas)
export const getLinkedBeacon = async () => {
  try {
    const mac = await AsyncStorage.getItem('@veci_beacon_mac');
    const typeStr = await AsyncStorage.getItem('@veci_beacon_alert_type');
    return {
      macAddress: mac,
      alertType: typeStr ? JSON.parse(typeStr) : null,
    };
  } catch (e) {
    return { macAddress: null, alertType: null };
  }
};

const alertItemName = (alertType) => {
  return alertType?.name || 'PANICO';
};

// Registrar tarea de segundo plano en Expo Task Manager para mantener el proceso JS vivo
TaskManager.defineTask(BACKGROUND_BLE_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Error en servicio de ubicación de fondo:', error);
    return;
  }
  
  // Guardar última ubicación de fondo reportada por el sistema
  if (data && data.locations && data.locations.length > 0) {
    const latestLoc = data.locations[data.locations.length - 1];
    lastBackgroundLocation = {
      latitude: latestLoc.coords.latitude,
      longitude: latestLoc.coords.longitude
    };
    console.log('DEBUG: 📍 Ubicación de fondo actualizada:', lastBackgroundLocation);
  }

  // Esta tarea se dispara periódicamente por actualizaciones de localización de fondo,
  // lo cual mantiene la máquina virtual de JS despierta en Android/iOS.
  // Dentro de ella nos aseguramos de que el escáner BLE continúe escuchando.
  if (!isScanning) {
    console.log('DEBUG: 🔄 Manteniendo activo el escaneo BLE de fondo...');
    startBleScan();
  }
});

// Configurar comportamiento de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Función para iniciar el escaneo BLE
export const startBleScan = async () => {
  if (isScanning) return;
  
  const beacons = await getLinkedBeacons();
  if (beacons.length === 0) {
    console.log('DEBUG: 🚫 No hay ningún llavero vinculado para escanear.');
    return;
  }

  const manager = getBleManager();
  isScanning = true;
  console.log(`DEBUG: 🔍 Iniciando escaneo de Bluetooth para ${beacons.length} llaveros: ${beacons.map(b => `${b.macAddress} (${b.alertType?.name || 'PANICO'})`).join(', ')}`);

  if (scanTimeoutId) {
    clearTimeout(scanTimeoutId);
  }
// Reiniciar escaneo periódicamente para evitar la congelación del stack BLE nativo (Watchdog)
scanTimeoutId = setTimeout(() => {
    console.log('DEBUG: 🐕 Watchdog: Reiniciando escaneo BLE para mantener estabilidad...');
    stopBleScan();
    setTimeout(() => {
      startBleScan();
    }, 2000);
  }, 120000); // Reiniciar cada 2 minutos en lugar de 3 para mayor fiabilidad

  manager.startDeviceScan(MINEW_SERVICE_UUIDS, { allowDuplicates: true, scanMode: ScanMode.LowLatency }, async (error, device) => {
    if (error) {
      console.warn('DEBUG: ⚠️ Error de escaneo BLE:', error.message);
      isScanning = false;
      if (scanTimeoutId) {
        clearTimeout(scanTimeoutId);
        scanTimeoutId = null;
      }
      return;
    }

    try {
      if (!device) return;

      // Minew D15N transmite su dirección MAC (en iOS es UUID temporal, pero en Android es MAC directa)
      const deviceMac = device.id ? device.id.toUpperCase() : '';
      
      const hasMinewService = (device.serviceUUIDs && device.serviceUUIDs.some(uuid => 
        uuid && (
          uuid.toLowerCase().includes('fff1') ||
          uuid.toLowerCase().includes('ffe1') ||
          uuid.toLowerCase().includes('feaa') ||
          uuid.toLowerCase().includes('c5e2') ||
          uuid.toLowerCase().includes('7f28')
        )
      )) || (device.serviceData && Object.keys(device.serviceData).some(key =>
        key && (
          key.toLowerCase().includes('fff1') ||
          key.toLowerCase().includes('ffe1') ||
          key.toLowerCase().includes('feaa') ||
          key.toLowerCase().includes('c5e2') ||
          key.toLowerCase().includes('7f28')
        )
      ));

      const isMinew = (device.name && device.name.toUpperCase().includes('D15N')) || 
                      deviceMac.startsWith('AC:23:3F') || 
                      hasMinewService;
      
      // Quiet non-Minew devices to keep logs clean
      // if (!isMinew && device.rssi > -70) {
      //   console.log(`DEBUG: 🔍 DISPOSITIVO CERCANO DETECTADO (No Minew/Llavero): MAC: ${deviceMac}, Name: ${device.name || 'N/A'}, RSSI: ${device.rssi}, UUIDs: ${JSON.stringify(device.serviceUUIDs || [])}`);
      // }

      if (isMinew) {
        let isButtonPressed = false;
        let hexString = 'N/A';
        let serviceDataLogs = 'N/A';
        let triggerSource = 'none';

        if (device.serviceData) {
          serviceDataLogs = JSON.stringify(Object.keys(device.serviceData).reduce((acc, key) => {
            const bytes = base64ToBytes(device.serviceData[key]);
            acc[key] = bytes ? Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ') : 'N/A';
            return acc;
          }, {}));
        }

        // 1. Detección por Key Finder estándar de Minew (0x21) en manufacturerData
        if (device.manufacturerData) {
          const bytes = base64ToBytes(device.manufacturerData);
          if (bytes) {
            hexString = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
            
            if (bytes.length >= 5) {
              const companyId = (bytes[1] << 8) | bytes[0];
              const frameType = bytes[2];
              const buttonStatus = bytes[4];
              const isMinewCompany = (companyId === 0x00E1 || companyId === 0xE100);

              if (isMinewCompany && frameType === 0x21 && buttonStatus > 0) {
                isButtonPressed = true;
                triggerSource = 'KeyFinder';
              }
            }
            
            // Detección de iBeacon con Minor 99 (Slot 2 configurado con trigger)
            if (!isButtonPressed && bytes.length === 25 && bytes[0] === 0x4C && bytes[1] === 0x00 && bytes[2] === 0x02 && bytes[3] === 0x15) {
              const minor = (bytes[22] << 8) | bytes[23];
              if (minor === 99) {
                isButtonPressed = true;
                triggerSource = 'iBeacon-Minor99';
              }
            }
          }
        }

        // Detección de Eddystone-UID de 29 bytes totales (18 bytes de carga útil en serviceData)
        if (!isButtonPressed && device.serviceData) {
          const eddystoneKey = Object.keys(device.serviceData).find(key => key.toLowerCase().includes('feaa'));
          if (eddystoneKey) {
            const bytes = base64ToBytes(device.serviceData[eddystoneKey]);
            if (bytes && bytes.length === 18 && bytes[0] === 0x00) {
              isButtonPressed = true;
              triggerSource = 'Eddystone-UID-Trigger';
            }
          }
        }

        // 2. Detección inteligente por ráfaga rápida de tramas de disparo FFF1/C5E2 en serviceUUIDs o serviceData
        if (!isButtonPressed) {
          const hasTriggerUuid = device.serviceUUIDs && device.serviceUUIDs.some(uuid => 
            uuid && (uuid.toLowerCase() === '0000fff1-0000-1000-8000-00805f9b34fb' ||
            uuid.toLowerCase().includes('fff1'))
          );
          
          let hasTriggerServiceData = false;
          if (device.serviceData) {
            hasTriggerServiceData = Object.keys(device.serviceData).some(key =>
              key && (key.toLowerCase() === '0000c5e2-0000-1000-8000-00805f9b34fb' ||
              key.toLowerCase().includes('c5e2'))
            );
          }

          if (hasTriggerUuid || hasTriggerServiceData) {
            const now = Date.now();
            if (!lastTriggerPackets[deviceMac]) {
              lastTriggerPackets[deviceMac] = [];
            }
            // Filtrar tiempos mayores a 3 segundos
            lastTriggerPackets[deviceMac] = lastTriggerPackets[deviceMac].filter(t => now - t < 3000);
            
            const lastTimestamp = lastTriggerPackets[deviceMac].length > 0 
              ? lastTriggerPackets[deviceMac][lastTriggerPackets[deviceMac].length - 1] 
              : 0;

            // Ignorar duplicados de recepción multi-canal en <100ms
            if (now - lastTimestamp >= 100) {
              lastTriggerPackets[deviceMac].push(now);
              if (lastTriggerPackets[deviceMac].length >= 3) {
                const firstTimestamp = lastTriggerPackets[deviceMac][lastTriggerPackets[deviceMac].length - 3];
                if (now - firstTimestamp < 800) { // 3 paquetes de disparo en <800ms indica ráfaga de clic del botón
                  isButtonPressed = true;
                  triggerSource = 'Minew-Trigger-Burst';
                }
              }
            }
          }
        }

        // 3. Detección inteligente por ráfaga rápida de tramas INFO (0xFFE1) en serviceData
        if (!isButtonPressed && device.serviceData) {
          const infoData = device.serviceData["0000ffe1-0000-1000-8000-00805f9b34fb"];
          if (infoData) {
            const bytes = base64ToBytes(infoData);
            if (bytes && bytes.length > 0 && bytes[0] === 0xa1) {
              const now = Date.now();
              if (!lastInfoPackets[deviceMac]) {
                lastInfoPackets[deviceMac] = [];
              }
              // Filtrar tiempos mayores a 3 segundos
              lastInfoPackets[deviceMac] = lastInfoPackets[deviceMac].filter(t => now - t < 3000);
              
              const lastTimestamp = lastInfoPackets[deviceMac].length > 0 
                ? lastInfoPackets[deviceMac][lastInfoPackets[deviceMac].length - 1] 
                : 0;

              // Ignorar duplicados de recepción multi-canal en <100ms
              if (now - lastTimestamp >= 100) {
                lastInfoPackets[deviceMac].push(now);
                if (lastInfoPackets[deviceMac].length >= 3) {
                  const firstTimestamp = lastInfoPackets[deviceMac][lastInfoPackets[deviceMac].length - 3];
                  if (now - firstTimestamp < 1500) {
                    isButtonPressed = true;
                    triggerSource = 'INFO-burst';
                  }
                }
              }
            }
          }
        }



        // Buscar si la MAC coincide con alguno de los beacons vinculados
        const matchingBeacon = beacons.find(b => b && b.macAddress && b.macAddress.toUpperCase() === deviceMac);
        const isLinked = !!matchingBeacon;

        const targetMacs = ['AC:23:3F:82:F6:8C', 'AC:23:3F:82:F7:68'];
        if (targetMacs.includes(deviceMac)) {
          if (!global.lastAnyPackets) global.lastAnyPackets = {};
          if (!global.lastAnyPackets[deviceMac]) global.lastAnyPackets[deviceMac] = [];
          global.lastAnyPackets[deviceMac].push(Date.now());
          if (global.lastAnyPackets[deviceMac].length > 5) {
            global.lastAnyPackets[deviceMac].shift();
          }
          const anyTimes = global.lastAnyPackets[deviceMac];
          const anyDeltas = anyTimes.map((t, idx) => idx > 0 ? t - anyTimes[idx-1] : 0).slice(1);

          const triggerTimes = lastTriggerPackets[deviceMac] || [];
          const triggerDeltas = triggerTimes.map((t, idx) => idx > 0 ? t - triggerTimes[idx-1] : 0).slice(1);

          console.log(`[TARGET_BLE:${deviceMac}] RSSI: ${device.rssi} | ButtonPressed: ${isButtonPressed} (Source: ${triggerSource})
  -> MfgData: ${hexString}
  -> SvcData: ${serviceDataLogs}
  -> UUIDs: ${JSON.stringify(device.serviceUUIDs || [])}
  -> RAW Deltas (ms): ${anyDeltas.join(', ')}
  -> Trigger Deltas (ms): ${triggerDeltas.join(', ')}`);
        } else {
          console.log(`DEBUG: 🎯 LLAVERO DETECTADO! MAC: ${deviceMac}, Vinculado: ${isLinked ? 'SÍ' : 'NO'}, RSSI: ${device.rssi}, ButtonPressed: ${isButtonPressed}, TriggerSource: ${triggerSource}`);
        }

        if (isButtonPressed && isLinked) {
          const now = Date.now();

          // 1. Debounce en memoria (sincrónico) para evitar ráfagas en el mismo hilo de JS
          const lastMemoryTime = lastTriggerTimesMemory[deviceMac] || 0;
          if (now - lastMemoryTime < DEBOUNCE_TIME_MS) {
            console.log(`DEBUG: ⏳ Alerta del llavero ${deviceMac} ignorada por bloqueo temporal EN MEMORIA.`);
            return;
          }

          // Guardar marca de tiempo sincrónicamente en memoria AHORA para bloquear otros paquetes de la ráfaga de inmediato
          lastTriggerTimesMemory[deviceMac] = now;

          // Si estamos en segundo plano (headless/background), agregamos un pequeño retardo desincronizado
          // para permitir que el contexto de primer plano (foreground) registre y bloquee la alerta primero.
          if (AppState.currentState !== 'active') {
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 200));
          }

          // 2. Debounce en AsyncStorage (asincrónico) por si se reinicia el contexto o para comunicación entre hilos
          const debounceKey = `@veci_beacon_last_trigger_${deviceMac}`;
          const lastTrigger = await AsyncStorage.getItem(debounceKey);
          if (lastTrigger && Math.abs(now - parseInt(lastTrigger)) < DEBOUNCE_TIME_MS) {
            console.log(`DEBUG: ⏳ Alerta del llavero ${deviceMac} ignorada por bloqueo temporal (AsyncStorage).`);
            if (parseInt(lastTrigger) > lastMemoryTime) {
              lastTriggerTimesMemory[deviceMac] = parseInt(lastTrigger);
            }
            return;
          }

          // Guardar marca de tiempo en AsyncStorage
          await AsyncStorage.setItem(debounceKey, now.toString());

          // Generar ID determinista basado en el bloque de 90 segundos actual para bloquear carreras simultáneas en BD
          const profileStr = await AsyncStorage.getItem('user_profile_json');
          const userProfile = profileStr ? JSON.parse(profileStr) : null;
          const userId = userProfile?.id || 'anonymous';
          const timeBucket = Math.floor(now / DEBOUNCE_TIME_MS);
          const deterministicId = generateDeterministicUUID(userId, deviceMac, timeBucket);

          // Disparar Alerta a Supabase/MQTT con el tipo de alerta configurado para este llavero específico
          triggerBeaconAlert(matchingBeacon.alertType, deterministicId, triggerSource);
        }
      }
    } catch (err) {
      console.warn('DEBUG: ⚠️ Error al procesar dispositivo en escaneo BLE:', err.message);
    }
  });
};

export const stopBleScan = () => {
  const manager = getBleManager();
  manager.stopDeviceScan();
  isScanning = false;
  if (scanTimeoutId) {
    clearTimeout(scanTimeoutId);
    scanTimeoutId = null;
  }
  console.log('DEBUG: 🛑 Escaneo de Bluetooth detenido.');
};

// Obtener coordenadas GPS de forma rápida y no bloqueante en segundo plano
const getFastLocation = async () => {
  try {
    // 1. Usar la última ubicación recibida por la tarea de fondo si está disponible
    if (lastBackgroundLocation) {
      console.log('DEBUG: 📍 Usando ubicación guardada de fondo:', lastBackgroundLocation);
      return lastBackgroundLocation;
    }

    // 2. Intentar obtener la última ubicación conocida por el sistema (muy rápido, sin hardware GPS lock)
    const lastLoc = await Location.getLastKnownPositionAsync();
    if (lastLoc) {
      console.log('DEBUG: 📍 Usando última ubicación conocida del sistema:', lastLoc.coords);
      return { latitude: lastLoc.coords.latitude, longitude: lastLoc.coords.longitude };
    }

    // 3. Solo si la app está activa (primer plano), intentar obtener la ubicación actual con un timeout estricto
    if (AppState.currentState === 'active') {
      console.log('DEBUG: 📍 App activa. Intentando obtener ubicación actual...');
      const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1000));
      const loc = await Promise.race([locationPromise, timeoutPromise]);
      if (loc) {
        return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      }
    }
  } catch (e) {
    console.warn('DEBUG: ⚠️ No se pudo obtener GPS rápido para la alerta del llavero:', e.message);
  }
  return { latitude: 0, longitude: 0 };
};

// Función para disparar la alerta desde segundo plano con ID determinista de deduplicación
const triggerBeaconAlert = async (alertItem, deterministicId, triggerSource) => {
  try {
    console.log('DEBUG: 🚨 DISPARANDO ALERTA DESDE LLAVERO...');
    
    // Obtener información del perfil del vecino
    const profileStr = await AsyncStorage.getItem('user_profile_json');
    const userProfile = profileStr ? JSON.parse(profileStr) : null;
    const phone = await AsyncStorage.getItem('user_phone') || 'No registrado';
    const activeImei = await AsyncStorage.getItem('active_device_imei');

    if (!activeImei) {
      console.warn('DEBUG: ⚠️ No hay IMEI activo para disparar la sirena.');
      return;
    }

    // 1.5. Consultar duplicados en Supabase y obtener GPS en paralelo para minimizar la latencia de disparo
    const nowDb = new Date();
    const ninetySecondsAgo = new Date(nowDb.getTime() - DEBOUNCE_TIME_MS).toISOString();

    const [dbCheckResult, gpsResult] = await Promise.all([
      // Consulta de alerta duplicada reciente en Supabase con timeout de 1.5 segundos
      (async () => {
        try {
          const checkPromise = supabase
            .from('alert_logs')
            .select('created_at')
            .eq('imei', activeImei)
            .eq('user_id', userProfile?.id || null)
            .eq('metadata->>trigger_source', 'bluetooth_beacon')
            .gt('created_at', ninetySecondsAgo)
            .order('created_at', { ascending: false })
            .limit(1);
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ data: [], error: null }), 1500));
          const result = await Promise.race([checkPromise, timeoutPromise]);
          if (result && result.error) throw result.error;
          return result ? result.data : [];
        } catch (err) {
          console.warn('DEBUG: ⚠️ Error al consultar alertas recientes en Supabase:', err.message);
          return [];
        }
      })(),
      // Obtener coordenadas GPS de forma rápida
      getFastLocation()
    ]);

    if (dbCheckResult && dbCheckResult.length > 0) {
      console.log(`DEBUG: ⏳ Alerta ignorada. Supabase ya registró una alerta del llavero para este usuario en los últimos 90s (${dbCheckResult[0].created_at}).`);
      return;
    }

    const { latitude, longitude } = gpsResult;

    // 1. Enviar comando por MQTT para activar la Sirena Física
    const payload = JSON.stringify({
      "Comando": 12,
      "Consecutivo": 1,
      "Trama": [
        parseInt(alertItem?.folder || 1),
        parseInt(alertItem?.filename || 1),
        3, // repeticiones por defecto
        15 // volumen máximo por defecto
      ]
    });

    try {
      if (global.mqttClient && typeof global.mqttClient.publish === 'function' && global.mqttClient.connected) {
        console.log('DEBUG: 🚨 Usando cliente MQTT global en segundo plano para activar sirena...');
        global.mqttClient.publish(`veciseguro/${activeImei}/cmd`, payload, { qos: 1 }, (err) => {
          if (err) {
            console.error('DEBUG: ❌ Error publicando MQTT en cliente global:', err.message);
          } else {
            console.log('DEBUG: ✅ Comando MQTT enviado exitosamente mediante cliente global.');
          }
        });
      } else {
        console.log('DEBUG: 🚨 Cliente MQTT global no disponible o desconectado. Conectando a demanda...');
        const options = {
          clientId: 'veci_service_' + Math.random().toString(16).substr(2, 8),
          username: 'VeciSeguro',
          password: 'Mofnem-xubcyd-gizro1',
          clean: true,
          connectTimeout: 4000,
        };
        const onDemandClient = mqtt.connect('wss://a2467217.ala.us-east-1.emqxsl.com:8084/mqtt', options);
        
        onDemandClient.on('connect', () => {
          console.log('DEBUG: 🚨 Conectado a MQTT a demanda en segundo plano. Enviando comando...');
          onDemandClient.publish(`veciseguro/${activeImei}/cmd`, payload, { qos: 1 }, (err) => {
            if (err) {
              console.error('DEBUG: ❌ Error publicando MQTT a demanda:', err.message);
            } else {
              console.log('DEBUG: ✅ Comando MQTT enviado exitosamente a demanda.');
            }
            onDemandClient.end(true);
          });
        });

        onDemandClient.on('error', (err) => {
          console.error('DEBUG: ❌ Error MQTT a demanda:', err.message);
          onDemandClient.end(true);
        });
      }
    } catch (mqttErr) {
      console.error('DEBUG: ❌ Error general al enviar MQTT:', mqttErr.message);
    }

    // 2. Registrar Alerta en Supabase (alert_logs)
    const { error } = await supabase
      .from('alert_logs')
      .insert([
        {
          id: deterministicId,
          imei: activeImei,
          alert_name: (alertItem?.name || 'PÁNICO LLAVERO').toUpperCase(),
          user_id: userProfile?.id || null,
          metadata: {
            user_name: userProfile?.full_name || 'Llavero de Pánico',
            phone: phone,
            location: 'Llavero Bluetooth',
            status: 'active',
            latitude: latitude,
            longitude: longitude,
            folder: alertItem?.folder || 1,
            filename: alertItem?.filename || 1,
            requires_chat: alertItem?.requires_chat !== false,
            trigger_source: 'bluetooth_beacon',
            scanner_trigger_source: triggerSource
          }
        }
      ]);

    if (error) {
      if (error.code === '23505') {
        console.log('DEBUG: ⏳ Alerta duplicada bloqueada por clave primaria única (PK) en Supabase.');
        return;
      }
      throw error;
    }
    console.log('DEBUG: ✅ Alerta del llavero grabada exitosamente en Supabase.');

    // 3. Mostrar notificación local inmediata al usuario
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🚨 ¡BOTÓN DE PÁNICO ACTIVADO!",
        body: `Se ha disparado una alerta de ${(alertItem?.name || 'PANICO').toUpperCase()} desde tu llavero BLE.`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        channelId: 'default',
      },
      trigger: null,
    });

  } catch (err) {
    console.error('Error al disparar alerta del llavero:', err.message);
  }
};

// Iniciar servicio en segundo plano
export const startBackgroundBleService = async () => {
  try {
    const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
    if (foreStatus !== 'granted') {
      console.warn('DEBUG: Permisos de ubicación en primer plano denegados. No se iniciará el escaneo BLE.');
      return;
    }

    // En Android requerimos background location para mantener vivo el JS en segundo plano
    if (Platform.OS === 'android') {
      try {
        const { status: backStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backStatus === 'granted') {
          await Location.startLocationUpdatesAsync(BACKGROUND_BLE_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 60000,
            distanceInterval: 50,
            foregroundService: {
              notificationTitle: 'VeciSeguro Activo',
              notificationBody: 'Monitoreando tu botón de pánico en segundo plano.',
              notificationColor: '#4F46E5',
            },
          });
        }
      } catch (locationErr) {
        console.warn('DEBUG: No se pudo iniciar el servicio de ubicación en segundo plano:', locationErr.message);
      }
    }
  } catch (err) {
    console.error('Error al iniciar servicio de fondo BLE:', err);
  }

  // Iniciar escaneo BLE en cualquier caso
  try {
    await startBleScan();
  } catch (bleErr) {
    console.error('Error al iniciar escaneo BLE desde servicio de fondo:', bleErr);
  }
};
