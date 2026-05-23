import React from 'react';
import { StyleSheet, Dimensions, FlatList, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, PermissionsAndroid } from 'react-native';
import { Block, theme, Text, Button } from 'galio-framework';
import { Icon } from '../components';
import { argonTheme } from '../constants';
import { getBleManager, saveLinkedBeacon, getLinkedBeacon, startBleScan, getLinkedBeacons, removeLinkedBeacon, stopBleScan } from '../src/services/BlePanicService';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../constants/Supabase';
import { ScanMode } from 'react-native-ble-plx';

const { width } = Dimensions.get('screen');

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

const ALERT_OPTIONS = [
  { id: '1', name: 'Alerta Comunitaria', folder: '1', filename: '1', color: '#EF4444' },
  { id: '2', name: 'Enfermería / Médica', folder: '2', filename: '2', color: '#10B981' },
  { id: '3', name: 'Apoyo Seguridad', folder: '3', filename: '3', color: '#3B82F6' },
  { id: '4', name: 'Incendio', folder: '4', filename: '4', color: '#F97316' },
];

export default class LinkBeacon extends React.Component {
  _isMounted = true;
  isProcessingLink = false;
  lastInfoPackets = {};
  lastTriggerPackets = {};

  setState(state, callback) {
    if (this._isMounted) {
      super.setState(state, callback);
    }
  }

  state = {
    isScanning: false,
    devices: [],
    linkedBeacons: [],
    editingBeaconMac: null,
    selectedAlert: ALERT_OPTIONS[0],
    permissionsGranted: false,
    filterD15N: true,
  };

  async componentDidMount() {
    await this.loadLinkedBeacon();
    await this.checkPermissions();
  }

  componentWillUnmount() {
    this._isMounted = false;
    this.stopScanning();
  }

  loadLinkedBeacon = async () => {
    const beacons = await getLinkedBeacons();
    if (this._isMounted) {
      this.setState({ linkedBeacons: beacons });
    }
  };

  checkPermissions = async () => {
    try {
      console.log('DEBUG: Iniciando checkPermissions...');
      
      let foreStatus = 'denied';
      try {
        const foreCheck = await Location.getForegroundPermissionsAsync();
        foreStatus = foreCheck.status;
        console.log(`DEBUG: Check Foreground Location status: ${foreStatus}`);
        if (foreStatus !== 'granted') {
          const foreReq = await Location.requestForegroundPermissionsAsync();
          foreStatus = foreReq.status;
          console.log(`DEBUG: Request Foreground Location status: ${foreStatus}`);
        }
      } catch (err) {
        console.warn('DEBUG: Error al consultar/solicitar ubicación foreground:', err);
      }
      
      let backStatus = 'granted';
      let btGranted = true;

      if (Platform.OS === 'android') {
        if (foreStatus === 'granted') {
          try {
            const backCheck = await Location.getBackgroundPermissionsAsync();
            backStatus = backCheck.status;
            console.log(`DEBUG: Check Background Location status: ${backStatus}`);
            if (backStatus !== 'granted') {
              const backReq = await Location.requestBackgroundPermissionsAsync();
              backStatus = backReq.status;
              console.log(`DEBUG: Request Background Location status: ${backStatus}`);
            }
          } catch (err) {
            console.warn('DEBUG: Error al consultar/solicitar ubicación background:', err);
          }
        } else {
          backStatus = 'denied';
          console.log('DEBUG: Saltando Background Location porque Foreground fue denegado.');
        }
        
        // Si es Android 12 o superior (API >= 31), requerimos solicitar permisos de Bluetooth a nivel de runtime
        if (Platform.Version >= 31) {
          try {
            console.log('DEBUG: Verificando permisos de Bluetooth...');
            const hasScan = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
            const hasConnect = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
            console.log(`DEBUG: Bluetooth check - Scan: ${hasScan}, Connect: ${hasConnect}`);
            
            let scanGranted = hasScan ? PermissionsAndroid.RESULTS.GRANTED : null;
            let connectGranted = hasConnect ? PermissionsAndroid.RESULTS.GRANTED : null;
            
            if (!hasScan) {
              scanGranted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                {
                  title: "Permiso de Escaneo Bluetooth",
                  message: "VeciSeguro necesita escanear Bluetooth para encontrar tu llavero.",
                  buttonNeutral: "Preguntar después",
                  buttonNegative: "Cancelar",
                  buttonPositive: "Permitir"
                }
              );
              console.log(`DEBUG: Resultado solicitud BLUETOOTH_SCAN: ${scanGranted}`);
            }
            
            if (!hasConnect) {
              connectGranted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                {
                  title: "Permiso de Conexión Bluetooth",
                  message: "VeciSeguro necesita conectarse a dispositivos Bluetooth.",
                  buttonNeutral: "Preguntar después",
                  buttonNegative: "Cancelar",
                  buttonPositive: "Permitir"
                }
              );
              console.log(`DEBUG: Resultado solicitud BLUETOOTH_CONNECT: ${connectGranted}`);
            }
            
            btGranted = (hasScan || scanGranted === PermissionsAndroid.RESULTS.GRANTED) &&
                        (hasConnect || connectGranted === PermissionsAndroid.RESULTS.GRANTED);
          } catch (err) {
            console.warn('DEBUG: Error al verificar/solicitar permisos Bluetooth:', err);
            btGranted = false;
          }
        }
        
        const finalGranted = foreStatus === 'granted' && backStatus === 'granted' && btGranted;
        console.log(`DEBUG: Permisos finales en Android: ${finalGranted} (Foreground: ${foreStatus}, Background: ${backStatus}, Bluetooth: ${btGranted})`);
        if (this._isMounted) {
          this.setState({ permissionsGranted: finalGranted });
        }
      } else {
        const finalGranted = foreStatus === 'granted';
        console.log(`DEBUG: Permisos finales en iOS: ${finalGranted}`);
        if (this._isMounted) {
          this.setState({ permissionsGranted: finalGranted });
        }
      }
    } catch (e) {
      console.warn('Error al revisar permisos de localización/bluetooth:', e);
    }
  };

  startScanning = async () => {
    try {
      console.log('DEBUG: startScanning llamado.');
      await this.checkPermissions();
      const { permissionsGranted } = this.state;
      if (!permissionsGranted) {
        Alert.alert(
          'Permisos requeridos',
          'Necesitamos permisos de localización precisa (incluso en segundo plano para Android) y Bluetooth para buscar tu llavero. Si ya los rechazaste, por favor actívalos desde los Ajustes de la aplicación en tu celular.'
        );
        return;
      }

      this.isProcessingLink = false;
      this.lastInfoPackets = {};

      if (this._isMounted) {
        this.setState({ isScanning: true, devices: [] });
      }
      console.log('DEBUG: Obteniendo BleManager...');
      const manager = getBleManager();
      console.log('DEBUG: Deteniendo escaneos previos...');
      manager.stopDeviceScan();

      // Escanear por 10 segundos
      setTimeout(() => {
        if (this._isMounted && this.state.isScanning) {
          console.log('DEBUG: Escaneo de 10s completado. Deteniendo...');
          manager.stopDeviceScan();
          this.setState({ isScanning: false });
          if (this.state.devices.length === 0) {
            Alert.alert('No se encontraron llaveros', 'Asegúrate de oprimir el botón de tu llavero Minew para que transmita señal.');
          }
        } else if (!this._isMounted) {
          manager.stopDeviceScan();
        }
      }, 10000);

      console.log('DEBUG: Iniciando startDeviceScan...');
      const MINEW_SERVICE_UUIDS = [
        '0000feaa-0000-1000-8000-00805f9b34fb', // Eddystone
        '0000ffe1-0000-1000-8000-00805f9b34fb', // Info / Ráfagas
        '0000fff1-0000-1000-8000-00805f9b34fb', // Trigger / Presencia
        '00007f28-0000-1000-8000-00805f9b34fb'  // Configuración
      ];
      const serviceUUIDsFilter = this.state.filterD15N ? MINEW_SERVICE_UUIDS : null;
      manager.startDeviceScan(serviceUUIDsFilter, { allowDuplicates: true, scanMode: ScanMode.LowLatency }, (error, device) => {
        if (error) {
          console.warn('DEBUG: Error en startDeviceScan callback:', error.message);
          if (this._isMounted) {
            this.setState({ isScanning: false });
          }
          manager.stopDeviceScan();
          return;
        }

        if (device && device.id && this._isMounted) {
          const name = device.name || device.localName || '';
          const id = device.id.toUpperCase();
          const rssi = device.rssi;

          // Filtrar por modelo o fabricante para mostrar únicamente los llaveros Minew / D15N si el filtro está activo
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

          const isMinew = name.toUpperCase().includes('D15N') || 
                          id.startsWith('AC:23:3F') || 
                          hasMinewService;

          if (!isMinew && rssi > -70) {
            console.log(`DEBUG: [LinkBeacon Scan] 🔍 DISPOSITIVO CERCANO DETECTADO (No Minew/Llavero): MAC: ${id}, Name: ${name || 'N/A'}, RSSI: ${rssi}, UUIDs: ${JSON.stringify(device.serviceUUIDs || [])}`);
          }

          if (this.state.filterD15N && !isMinew) {
            return;
          }

          // Log de depuración para ver qué trama transmite el llavero Minew
          if (isMinew && device.manufacturerData) {
            const bytes = base64ToBytes(device.manufacturerData);
            if (bytes) {
              const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
              console.log(`DEBUG: [LinkBeacon Scan] MAC: ${id}, Name: ${name}, MfgData Hex: ${hex}`);
            }
          }

          // Verificar si se oprimió el botón físico para vinculación automática
          let isButtonPressed = false;

          // 1. Detección por Key Finder estándar de Minew (0x21) en manufacturerData
          if (device.manufacturerData) {
            const bytes = base64ToBytes(device.manufacturerData);
            if (bytes) {
              if (bytes.length >= 5) {
                const companyId = (bytes[1] << 8) | bytes[0];
                const frameType = bytes[2];
                const buttonStatus = bytes[4];
                const isMinewCompany = (companyId === 0x00E1 || companyId === 0xE100);
                
                if (isMinewCompany && frameType === 0x21 && buttonStatus > 0) {
                  isButtonPressed = true;
                  console.log(`DEBUG: [LinkBeacon Scan] 🚨 Botón oprimido detectado (Key Finder)! MAC: ${id}, Status: ${buttonStatus}`);
                }
              }

              // Detección de iBeacon con Minor 99 (Slot 2 configurado con trigger)
              if (!isButtonPressed && bytes.length === 25 && bytes[0] === 0x4C && bytes[1] === 0x00 && bytes[2] === 0x02 && bytes[3] === 0x15) {
                const minor = (bytes[22] << 8) | bytes[23];
                if (minor === 99) {
                  isButtonPressed = true;
                  console.log(`DEBUG: [LinkBeacon Scan] 🚨 Botón oprimido detectado (iBeacon Minor 99)! MAC: ${id}`);
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
                console.log(`DEBUG: [LinkBeacon Scan] 🚨 Botón oprimido detectado (Eddystone-UID)! MAC: ${id}`);
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
              if (!this.lastTriggerPackets[id]) {
                this.lastTriggerPackets[id] = [];
              }
              // Filtrar tiempos mayores a 3 segundos
              this.lastTriggerPackets[id] = this.lastTriggerPackets[id].filter(t => now - t < 3000);
              
              const lastTimestamp = this.lastTriggerPackets[id].length > 0 
                ? this.lastTriggerPackets[id][this.lastTriggerPackets[id].length - 1] 
                : 0;

              // Ignorar duplicados de recepción multi-canal en <100ms
              if (now - lastTimestamp >= 100) {
                this.lastTriggerPackets[id].push(now);
                if (this.lastTriggerPackets[id].length >= 3) {
                  const firstTimestamp = this.lastTriggerPackets[id][this.lastTriggerPackets[id].length - 3];
                  if (now - firstTimestamp < 800) { // 3 paquetes de disparo en <800ms indica ráfaga de clic del botón
                    isButtonPressed = true;
                    console.log(`DEBUG: [LinkBeacon Scan] 🚨 Botón oprimido detectado (Ráfaga de disparo FFF1/C5E2)! MAC: ${id}, Delta: ${now - firstTimestamp}ms`);
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
                if (!this.lastInfoPackets[id]) {
                  this.lastInfoPackets[id] = [];
                }
                // Filtrar tiempos mayores a 3 segundos
                this.lastInfoPackets[id] = this.lastInfoPackets[id].filter(t => now - t < 3000);
                
                const lastTimestamp = this.lastInfoPackets[id].length > 0 
                  ? this.lastInfoPackets[id][this.lastInfoPackets[id].length - 1] 
                  : 0;

                // Ignorar duplicados de recepción multi-canal en <100ms
                if (now - lastTimestamp >= 100) {
                  this.lastInfoPackets[id].push(now);
                  if (this.lastInfoPackets[id].length >= 3) {
                    const firstTimestamp = this.lastInfoPackets[id][this.lastInfoPackets[id].length - 3];
                    if (now - firstTimestamp < 1500) {
                      isButtonPressed = true;
                      console.log(`DEBUG: [LinkBeacon Scan] 🚨 Botón oprimido detectado (Ráfaga INFO)! MAC: ${id}, Delta: ${now - firstTimestamp}ms`);
                    }
                  }
                }
              }
            }
          }



          if (isButtonPressed) {
            if (!this.isProcessingLink) {
              this.isProcessingLink = true;
              this.handleAutoLink(id);
            }
            return;
          }

          // Filtrar duplicados y actualizar la lista ordenando por señal (más cercano arriba)
          this.setState(prevState => {
            const exists = prevState.devices.some(d => d.id === id);
            let updatedList = [];
            if (exists) {
              updatedList = prevState.devices.map(d => d.id === id ? { ...d, rssi } : d);
            } else {
              updatedList = [...prevState.devices, { id, name, rssi }];
            }
            return { devices: updatedList.sort((a, b) => b.rssi - a.rssi) };
          });
        }
      });
    } catch (err) {
      console.error('DEBUG: Excepción capturada en startScanning:', err);
      Alert.alert('Error al iniciar escaneo', err.message);
      if (this._isMounted) {
        this.setState({ isScanning: false });
      }
    }
  };

  stopScanning = () => {
    stopBleScan();
    if (this._isMounted) {
      this.setState({ isScanning: false });
    }
  };

  handleAutoLink = async (macAddress) => {
    const formattedMac = macAddress.toUpperCase();
    const { linkedBeacons } = this.state;

    // Detener el escaneo inmediatamente
    this.stopScanning();

    const exists = linkedBeacons.some(b => b.macAddress.toUpperCase() === formattedMac);
    if (exists) {
      Alert.alert(
        'Dispositivo ya vinculado',
        `El llavero con dirección MAC ${formattedMac} ya se encuentra vinculado en esta aplicación.`
      );
      this.isProcessingLink = false;
    } else {
      await this.linkDevice(formattedMac);
    }
  };

  linkDevice = async (macAddress) => {
    try {
      const { selectedAlert } = this.state;
      await saveLinkedBeacon(macAddress, selectedAlert);
      
      // Reload beacons list
      await this.loadLinkedBeacon();
      
      // Iniciar el servicio
      try {
        await startBleScan();
      } catch (serviceErr) {
        console.warn('DEBUG: Error al iniciar startBleScan en servicio:', serviceErr);
      }
      
      Alert.alert(
        '¡Llavero Vinculado!',
        `Tu llavero con MAC ${macAddress} ha sido configurado para disparar una "${selectedAlert.name}".`
      );
    } catch (err) {
      console.error('DEBUG: Error en linkDevice:', err);
      Alert.alert('Error al vincular', err.message);
    } finally {
      this.isProcessingLink = false;
    }
  };

  deleteBeacon = async (macAddress) => {
    Alert.alert(
      'Confirmar Eliminación',
      `¿Estás seguro de que deseas desvincular el llavero con dirección MAC ${macAddress}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await removeLinkedBeacon(macAddress);
            await this.loadLinkedBeacon();
            Alert.alert('Desvinculado', 'Se ha eliminado el llavero registrado.');
            
            // Reiniciar escaneo para actualizar lista de monitoreo de fondo
            try {
              await startBleScan();
            } catch (err) {
              console.warn('DEBUG: Error al reiniciar startBleScan tras eliminación:', err);
            }
          }
        }
      ]
    );
  };

  renderDeviceItem = ({ item }) => {
    const isClosest = this.state.devices[0]?.id === item.id;
    return (
      <TouchableOpacity 
        style={[styles.deviceCard, isClosest && styles.closestCard]} 
        onPress={() => {
          if (!this.isProcessingLink) {
            this.isProcessingLink = true;
            this.handleAutoLink(item.id);
          }
        }}
      >
        <Block row align="center" justify="space-between">
          <Block>
            <Text size={14} bold color={argonTheme.COLORS.HEADER}>{item.name}</Text>
            <Text size={12} color={argonTheme.COLORS.MUTED}>{item.id}</Text>
          </Block>
          <Block row align="center">
            <Icon name="signal" family="Font-Awesome" size={14} color={isClosest ? '#10B981' : '#6B7280'} />
            <Text size={12} bold style={{ marginLeft: 6 }} color={isClosest ? '#10B981' : '#6B7280'}>
              {item.rssi} dBm
            </Text>
          </Block>
        </Block>
      </TouchableOpacity>
    );
  };

  render() {
    const { isScanning, devices, linkedBeacons, editingBeaconMac, selectedAlert, filterD15N } = this.state;

    return (
      <Block flex style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Block card style={styles.card}>
            <Block row align="center" style={styles.cardHeader}>
              <Icon name="bluetooth" family="Font-Awesome" size={20} color={argonTheme.COLORS.PRIMARY} />
              <Text size={18} bold style={{ marginLeft: 10 }}>Botón de Pánico Llavero</Text>
            </Block>

            <Text size={14} color={argonTheme.COLORS.TEXT} style={{ marginBottom: 15 }}>
              Puedes configurar un botón físico Bluetooth (Minew D15N) para disparar alarmas al instante sin abrir el celular.
            </Text>

            {linkedBeacons && linkedBeacons.length > 0 ? (
              linkedBeacons.map((item, idx) => {
                const beaconAlert = item.alertType || ALERT_OPTIONS[0];
                return (
                  <Block key={item.macAddress || idx} style={styles.linkedSection}>
                    <Block row align="center" justify="space-between" style={{ marginBottom: 10 }}>
                      <Block row align="center">
                        <Icon name="check-circle" family="Feather" size={20} color="#10B981" />
                        <Text size={16} bold color="#10B981" style={{ marginLeft: 8 }}>LLAVERO VINCULADO</Text>
                      </Block>
                      <TouchableOpacity onPress={() => this.deleteBeacon(item.macAddress)}>
                        <Icon name="trash-2" family="Feather" size={20} color={argonTheme.COLORS.ERROR} />
                      </TouchableOpacity>
                    </Block>
                    
                    <Text size={14} bold>Dispositivo MAC: <Text color={argonTheme.COLORS.PRIMARY}>{item.macAddress}</Text></Text>
                    <Text size={14} style={{ marginTop: 5, marginBottom: 10 }}>
                      Tipo de Alerta: <Text bold color={beaconAlert.color}>{beaconAlert.name}</Text>
                    </Text>

                    {editingBeaconMac === item.macAddress ? (
                      <Block style={styles.editSection}>
                        <Text size={13} bold style={{ marginBottom: 8, color: argonTheme.COLORS.HEADER }}>
                          Personalizar tipo de alerta:
                        </Text>
                        {ALERT_OPTIONS.map((option) => (
                          <TouchableOpacity
                            key={option.id}
                            style={[
                              styles.optionCardMini,
                              beaconAlert.name === option.name && { borderColor: option.color, backgroundColor: option.color + '15' }
                            ]}
                            onPress={async () => {
                              await saveLinkedBeacon(item.macAddress, option);
                              await this.loadLinkedBeacon();
                              this.setState({ editingBeaconMac: null });
                              Alert.alert('¡Personalizado!', `Llavero configurado para alertar: ${option.name}`);
                            }}
                          >
                            <Block row align="center" justify="space-between">
                              <Text size={13} bold color={beaconAlert.name === option.name ? option.color : argonTheme.COLORS.TEXT}>
                                {option.name}
                              </Text>
                              {beaconAlert.name === option.name && (
                                <Icon name="check" family="Feather" size={14} color={option.color} />
                              )}
                            </Block>
                          </TouchableOpacity>
                        ))}
                        <Button 
                          small 
                          color="secondary" 
                          style={{ marginTop: 10, width: 100, height: 30 }}
                          onPress={() => this.setState({ editingBeaconMac: null })}
                        >
                          <Text size={12} bold color={argonTheme.COLORS.TEXT}>Cancelar</Text>
                        </Button>
                      </Block>
                    ) : (
                      <Button 
                        small 
                        color="primary" 
                        style={{ marginTop: 5, width: 140, height: 35 }}
                        onPress={() => this.setState({ editingBeaconMac: item.macAddress })}
                      >
                        <Block row align="center">
                          <Icon name="edit-2" family="Feather" size={12} color="white" style={{ marginRight: 6 }} />
                          <Text size={12} bold color="white">Personalizar</Text>
                        </Block>
                      </Button>
                    )}
                  </Block>
                );
              })
            ) : (
              <Block style={styles.unlinkedSection}>
                <Text size={14} bold color={argonTheme.COLORS.MUTED}>Ningún llavero vinculado actualmente.</Text>
              </Block>
            )}
          </Block>

          {/* Configuración del Tipo de Alerta */}
          <Block card style={styles.card}>
            <Text size={16} bold style={{ marginBottom: 10 }}>1. Elige el tipo de Alerta a disparar</Text>
            {ALERT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.optionCard,
                  selectedAlert.id === option.id && { borderColor: option.color, backgroundColor: option.color + '15' }
                ]}
                onPress={() => this.setState({ selectedAlert: option })}
              >
                <Block row align="center" justify="space-between">
                  <Text size={14} bold color={selectedAlert.id === option.id ? option.color : argonTheme.COLORS.HEADER}>
                    {option.name}
                  </Text>
                  {selectedAlert.id === option.id && (
                    <Icon name="check" family="Feather" size={16} color={option.color} />
                  )}
                </Block>
              </TouchableOpacity>
            ))}
          </Block>

          {/* Escaneo de Dispositivos */}
          <Block card style={styles.card}>
            <Text size={16} bold style={{ marginBottom: 10 }}>2. Enciende y acerca tu llavero</Text>
            <Text size={12} color={argonTheme.COLORS.MUTED} style={{ marginBottom: 15 }}>
              Oprime el botón del llavero física y repetidamente mientras escaneas para que aparezca en el tope de la lista.
            </Text>

            <Block row justify="space-between" align="center" style={{ marginBottom: 15, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F3F4F6' }}>
              <Text size={13} color={argonTheme.COLORS.TEXT}>Filtrar solo llaveros Minew D15N</Text>
              <TouchableOpacity
                onPress={() => this.setState({ filterD15N: !filterD15N, devices: [] })}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 20,
                  backgroundColor: filterD15N ? argonTheme.COLORS.PRIMARY : '#E5E7EB',
                }}
              >
                <Text size={11} bold color={filterD15N ? 'white' : '#4B5563'}>
                  {filterD15N ? 'ACTIVO' : 'INACTIVO'}
                </Text>
              </TouchableOpacity>
            </Block>

            <Block row justify="space-between" align="center" style={{ marginBottom: 15 }}>
              {isScanning ? (
                <Button color="warning" style={styles.scanButton} onPress={this.stopScanning}>
                  Detener Escaneo
                </Button>
              ) : (
                <Button color="primary" style={styles.scanButton} onPress={this.startScanning}>
                  Buscar Llaveros BLE
                </Button>
              )}
              {isScanning && <ActivityIndicator color={argonTheme.COLORS.PRIMARY} size="small" />}
            </Block>

            {isScanning && devices.length > 0 && (
              <Text size={12} bold color={argonTheme.COLORS.MUTED} style={{ marginBottom: 10 }}>
                Toca el dispositivo más cercano para vincularlo:
              </Text>
            )}

            <FlatList
              data={devices}
              renderItem={this.renderDeviceItem}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              ListEmptyComponent={
                isScanning ? (
                  <Text size={12} italic color={argonTheme.COLORS.MUTED} style={{ textAlign: 'center', padding: 20 }}>
                    Buscando señales... mantén presionado tu llavero.
                  </Text>
                ) : null
              }
            />
          </Block>
        </ScrollView>
      </Block>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8F9FE',
  },
  scrollContent: {
    padding: 15,
  },
  card: {
    backgroundColor: theme.COLORS.WHITE,
    marginVertical: 8,
    padding: 15,
    borderRadius: 12,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 10,
    marginBottom: 10,
  },
  linkedSection: {
    backgroundColor: '#ECFDF5',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 10,
  },
  unlinkedSection: {
    backgroundColor: '#F3F4F6',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    marginTop: 10,
  },
  optionCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginVertical: 4,
  },
  scanButton: {
    width: width * 0.6,
    borderRadius: 8,
  },
  deviceCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginVertical: 4,
    backgroundColor: '#F9FAFB',
  },
  closestCard: {
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
  },
  editSection: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  optionCardMini: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    marginVertical: 3,
  },
});
