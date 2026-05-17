import React from 'react';
import { StyleSheet, Dimensions, ScrollView, TouchableOpacity, Animated, ActivityIndicator, Image } from 'react-native';
import { Block, theme, Text, Button } from 'galio-framework';
import { Icon, Input } from '../components';
import { argonTheme } from '../constants';
import { supabase } from '../constants/Supabase';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
global.Buffer = Buffer; // Necesario para que MQTT funcione en React Native
import mqtt from 'mqtt/dist/mqtt';

const { width } = Dimensions.get('screen');

const getAlertColors = (name) => {
  const norm = (name || '').toLowerCase();
  if (norm.includes('acoso') || norm.includes('bullying')) {
    return { bg: '#EEF2FF', border: '#4F46E5', text: '#4F46E5', accent: '#818CF8' }; // Indigo
  }
  if (norm.includes('apoyo') || norm.includes('seguridad') || norm.includes('polic') || norm.includes('vigil')) {
    return { bg: '#EFF6FF', border: '#2563EB', text: '#2563EB', accent: '#3B82F6' }; // Police Blue
  }
  if (norm.includes('comun') || norm.includes('panic') || norm.includes('pánico') || norm.includes('general')) {
    return { bg: '#FEF2F2', border: '#DC2626', text: '#DC2626', accent: '#F87171' }; // Danger Red
  }
  if (norm.includes('fuego') || norm.includes('incend') || norm.includes('bomber')) {
    return { bg: '#FFF7ED', border: '#EA580C', text: '#EA580C', accent: '#FB923C' }; // Fire Orange
  }
  if (norm.includes('medica') || norm.includes('salud') || norm.includes('enferm') || norm.includes('apoyo m')) {
    return { bg: '#ECFDF5', border: '#059669', text: '#059669', accent: '#34D399' }; // Emerald Green
  }
  return { bg: '#F9FAFB', border: '#4B5563', text: '#1F2937', accent: '#9CA3AF' }; // Default Neutral
};

const getAlertIcon = (name) => {
  const norm = (name || '').toLowerCase();
  if (norm.includes('acoso') || norm.includes('bullying')) {
    return { name: 'megaphone', family: 'Entypo' };
  }
  if (norm.includes('apoyo') || norm.includes('seguridad') || norm.includes('polic') || norm.includes('vigil')) {
    return { name: 'shield', family: 'Entypo' };
  }
  if (norm.includes('fuego') || norm.includes('incend') || norm.includes('bomber')) {
    return { name: 'fire', family: 'MaterialCommunityIcons' };
  }
  if (norm.includes('medica') || norm.includes('salud') || norm.includes('enferm') || norm.includes('apoyo m')) {
    return { name: 'medical-bag', family: 'MaterialCommunityIcons' };
  }
  return { name: 'users', family: 'Entypo' };
};

class Home extends React.Component {
  state = {
    isPressed: new Animated.Value(1),
    loading: false,
    location: null,
    userProfile: null,
    savedPhone: null,
    mqttClient: null,
    userDevices: [],
    selectedDevice: null,
    activeAlerts: [],
    loadingAlerts: false,
    imageErrors: {},
    deviceSearchQuery: '',
    alertSearchQuery: ''
  };

  async componentDidMount() {
    console.log("DEBUG: Home se ha montado.");
    
    // 1. Configurar MQTT
    this.connectMQTT();

    // 2. Pedir permisos de ubicación
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      alert('Se requiere permiso de ubicación para reportar emergencias.');
    }

    // 3. Leer el teléfono de la memoria (AsyncStorage)
    try {
      const phone = await AsyncStorage.getItem('user_phone');
      if (phone) {
        this.setState({ savedPhone: phone });
        const cleanPhone = phone.trim();
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .or(`phone.eq.${cleanPhone},phone.eq.+57${cleanPhone},phone.eq.${cleanPhone.replace('+57', '')}`)
          .single();

        if (profile) {
          console.log("DEBUG: ¡Perfil encontrado!", profile.full_name);
          this.setState({ userProfile: profile });
          await this.loadUserDevices(profile.id);
        } else if (cleanPhone === '3162346645' || cleanPhone === '+573162346645') {
          // Fallback de desarrollo para simulación con datos reales de Víctor
          const mockProfile = {
            id: '1b8863da-c50f-459c-9238-f68457944515',
            full_name: 'Victor Julio González',
            phone: cleanPhone,
            email: 'vijugo@gmail.com',
            isMock: true
          };
          console.log("DEBUG: ¡Perfil mockeado para pruebas locales!", mockProfile.full_name);
          this.setState({ userProfile: mockProfile });
          
          // Cargar las dos sirenas asignadas a Víctor de su perfil real
          const mockDevices = [
            {
              imei: '80:F1:B2:D3:5C:2C',
              alias: 'Prueba P4 Santalsabel',
              lat: 4.59917,
              lng: -74.10219
            },
            {
              imei: '80:F1:B2:D3:58:06', // IMEI de base de datos para Prueba P4 VeciSeguro
              alias: 'Prueba P4 VeciSeguro',
              lat: 4.6097,
              lng: -74.0817
            },
            {
              imei: 'TEST-IMEI-5-ALERTS',
              alias: '🧪 Prueba 5 Alertas',
              lat: 4.6000,
              lng: -74.1000
            },
            {
              imei: 'TEST-IMEI-20-ALERTS',
              alias: '🧪 Prueba 20 Alertas',
              lat: 4.6100,
              lng: -74.0900
            }
          ];
          const selected = mockDevices[0];
          this.setState({ 
            userDevices: mockDevices,
            selectedDevice: selected
          });
          this.loadDeviceAlerts(selected.imei);
        } else if (cleanPhone === '3106667094' || cleanPhone === '+573106667094') {
          // Fallback de desarrollo para simulación con datos reales de Jorge Perez
          const mockProfile = {
            id: 'b87d2ef1-5a41-4c6e-8d77-6f81b7a2d4b9',
            full_name: 'Jorge Perez',
            phone: cleanPhone,
            email: 'wintrok@hotmail.com',
            isMock: true
          };
          console.log("DEBUG: ¡Perfil mockeado para Jorge Perez!", mockProfile.full_name);
          this.setState({ userProfile: mockProfile });
          
          // Cargar la sirena asignada a Jorge Perez de su perfil
          const mockDevices = [
            {
              imei: '80:F1:B2:D3:5C:2C',
              alias: 'Prueba P4 Santalsabel',
              lat: 4.59917,
              lng: -74.10219,
              volume_alerts: 20,
              repetitions: 3
            },
            {
              imei: '80:F1:B2:D3:58:06',
              alias: 'Prueba P4 VeciSeguro',
              lat: 4.6097,
              lng: -74.0817,
              volume_alerts: 20,
              repetitions: 3
            },
            {
              imei: 'TEST-IMEI-5-ALERTS',
              alias: '🧪 Prueba 5 Alertas',
              lat: 4.6000,
              lng: -74.1000,
              volume_alerts: 20,
              repetitions: 3
            },
            {
              imei: 'TEST-IMEI-20-ALERTS',
              alias: '🧪 Prueba 20 Alertas',
              lat: 4.6100,
              lng: -74.0900,
              volume_alerts: 20,
              repetitions: 3
            }
          ];
          const selected = mockDevices[0];
          this.setState({ 
            userDevices: mockDevices,
            selectedDevice: selected
          });
          this.loadDeviceAlerts(selected.imei);
        }
      }
    } catch (err) {
      console.error("DEBUG: Error leyendo AsyncStorage:", err);
    }
  }

  loadUserDevices = async (profileId) => {
    try {
      console.log("DEBUG: Buscando dispositivos para user_id:", profileId);
      const { data: userDevs, error: devError } = await supabase
        .from('user_devices')
        .select('device_imei')
        .eq('user_id', profileId);

      if (devError) throw devError;

      if (userDevs && userDevs.length > 0) {
        const imeis = userDevs.map(ud => ud.device_imei.trim().toUpperCase());
        console.log("DEBUG: IMEIs encontrados en user_devices:", imeis);
        
        const { data: inventory, error: invError } = await supabase
          .from('devices_inventory')
          .select('imei, alias, lat, lng, volume_alerts, repetitions')
          .filter('imei', 'in', `(${imeis.join(',')})`);

        if (invError) throw invError;

        console.log("DEBUG: Equipos detallados recuperados:", inventory);
        const selected = inventory && inventory.length > 0 ? inventory[0] : null;
        
        // Inyectamos las sirenas virtuales de pruebas al final
        const finalDevices = [
          ...(inventory || []),
          {
            imei: 'TEST-IMEI-5-ALERTS',
            alias: '🧪 Prueba 5 Alertas',
            lat: 4.6000,
            lng: -74.1000
          },
          {
            imei: 'TEST-IMEI-20-ALERTS',
            alias: '🧪 Prueba 20 Alertas',
            lat: 4.6100,
            lng: -74.0900
          }
        ];

        this.setState({ 
          userDevices: finalDevices,
          selectedDevice: selected
        });

        if (selected) {
          this.loadDeviceAlerts(selected.imei);
        }
      } else {
        console.log("DEBUG: El usuario no tiene ningún equipo asignado en user_devices. Cargando mock de desarrollo.");
        const mockDevices = [
          {
            imei: '80:F1:B2:D3:5C:2C',
            alias: 'Prueba P4 Santalsabel',
            lat: 4.59917,
            lng: -74.10219
          },
          {
            imei: '80:F1:B2:D3:58:06',
            alias: 'Prueba P4 VeciSeguro',
            lat: 4.6097,
            lng: -74.0817
          },
          {
            imei: 'TEST-IMEI-5-ALERTS',
            alias: '🧪 Prueba 5 Alertas',
            lat: 4.6000,
            lng: -74.1000
          },
          {
            imei: 'TEST-IMEI-20-ALERTS',
            alias: '🧪 Prueba 20 Alertas',
            lat: 4.6100,
            lng: -74.0900
          }
        ];
        const selected = mockDevices[0];
        this.setState({ 
          userDevices: mockDevices,
          selectedDevice: selected
        });
        this.loadDeviceAlerts(selected.imei);
      }
    } catch (err) {
      console.warn("DEBUG: Error al consultar equipos asignados. Cargando mock fallback:", err.message);
      const mockDevices = [
        {
          imei: '80:F1:B2:D3:5C:2C',
          alias: 'Prueba P4 Santalsabel',
          lat: 4.59917,
          lng: -74.10219
        }
      ];
      const selected = mockDevices[0];
      this.setState({ 
        userDevices: mockDevices,
        selectedDevice: selected
      });
      this.loadDeviceAlerts(selected.imei);
    }
  };

  loadDeviceAlerts = async (imei) => {
    this.setState({ loadingAlerts: true });
    
    // INTERCEPTOR DE PRUEBAS / PLAYGROUND DE DISEÑO
    if (imei === 'TEST-IMEI-5-ALERTS') {
      const mock5 = [
        {
          id: 1,
          name: 'Alerta Comunitaria',
          mqtt_command: '1',
          folder: '01',
          filename: '001.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.036984342417753724.jpg',
        },
        {
          id: 21,
          name: 'Apoyo Seguridad',
          mqtt_command: '21',
          folder: '01',
          filename: '021.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.44202624317780237.png',
        },
        {
          id: 2,
          name: 'Incendio',
          mqtt_command: '2',
          folder: '01',
          filename: '002.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.019638656330525195.jpg',
        },
        {
          id: 22,
          name: 'Alerta Acoso',
          mqtt_command: '22',
          folder: '01',
          filename: '022.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.34251122646778.png',
        },
        {
          id: 4,
          name: 'Excremento Mascotas',
          mqtt_command: '4',
          folder: '01',
          filename: '004.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.22678617542065238.jpg',
        }
      ];
      this.setState({ activeAlerts: mock5, loadingAlerts: false });
      alert("🧪 PLAYGROUND: Cargadas 5 alertas de simulación.");
      return;
    }

    if (imei === 'TEST-IMEI-20-ALERTS') {
      const mock20 = [
        {
          id: 1,
          name: 'Alerta Comunitaria',
          mqtt_command: '1',
          folder: '01',
          filename: '001.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.036984342417753724.jpg',
        },
        {
          id: 21,
          name: 'Apoyo Seguridad',
          mqtt_command: '21',
          folder: '01',
          filename: '021.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.44202624317780237.png',
        },
        {
          id: 2,
          name: 'Incendio',
          mqtt_command: '2',
          folder: '01',
          filename: '002.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.019638656330525195.jpg',
        },
        {
          id: 22,
          name: 'Alerta Acoso',
          mqtt_command: '22',
          folder: '01',
          filename: '022.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.34251122646778.png',
        },
        {
          id: 4,
          name: 'Excremento Mascotas',
          mqtt_command: '4',
          folder: '01',
          filename: '004.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.22678617542065238.jpg',
        },
        {
          id: 9,
          name: 'E Médica',
          mqtt_command: '9',
          folder: '01',
          filename: '009.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.37934578573323274.png',
        },
        {
          id: 31,
          name: 'Enfermería',
          mqtt_command: '31',
          folder: '01',
          filename: '031.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.7464858219718473.png',
        },
        {
          id: 50,
          name: 'Sospechoso',
          mqtt_command: '50',
          folder: '01',
          filename: '050.mp3',
        },
        {
          id: 51,
          name: 'Violencia Familiar',
          mqtt_command: '51',
          folder: '01',
          filename: '051.mp3',
        },
        {
          id: 52,
          name: 'Hurto o Robo',
          mqtt_command: '52',
          folder: '01',
          filename: '052.mp3',
        },
        {
          id: 53,
          name: 'Accidente Vía',
          mqtt_command: '53',
          folder: '01',
          filename: '053.mp3',
        },
        {
          id: 54,
          name: 'Falla Eléctrica',
          mqtt_command: '54',
          folder: '01',
          filename: '054.mp3',
        },
        {
          id: 55,
          name: 'Fuga de Gas',
          mqtt_command: '55',
          folder: '01',
          filename: '055.mp3',
        },
        {
          id: 56,
          name: 'Corte de Agua',
          mqtt_command: '56',
          folder: '01',
          filename: '056.mp3',
        },
        {
          id: 57,
          name: 'Animal Perdido',
          mqtt_command: '57',
          folder: '01',
          filename: '057.mp3',
        },
        {
          id: 58,
          name: 'Ruido Excesivo',
          mqtt_command: '58',
          folder: '01',
          filename: '058.mp3',
        },
        {
          id: 59,
          name: 'Simulacro General',
          mqtt_command: '59',
          folder: '01',
          filename: '059.mp3',
        },
        {
          id: 60,
          name: 'Escombros en Calle',
          mqtt_command: '60',
          folder: '01',
          filename: '060.mp3',
        },
        {
          id: 61,
          name: 'Peligro en Calzada',
          mqtt_command: '61',
          folder: '01',
          filename: '061.mp3',
        },
        {
          id: 62,
          name: 'Otros Eventos',
          mqtt_command: '62',
          folder: '01',
          filename: '062.mp3',
        }
      ];
      this.setState({ activeAlerts: mock20, loadingAlerts: false });
      alert("🧪 PLAYGROUND: Cargadas 20 alertas de simulación.");
      return;
    }

    try {
      console.log("DEBUG: Cargando alertas configuradas para el equipo:", imei);
      const { data: configs, error } = await supabase
        .from('device_alert_configs')
        .select(`
          id,
          priority,
          is_enabled,
          alert_types (
            id,
            name,
            mqtt_command,
            folder,
            filename,
            logo_url,
            audio_url
          )
        `)
        .eq('device_imei', imei)
        .eq('is_enabled', true)
        .order('priority', { ascending: true });

      if (error) {
        alert("⚠️ ERROR SUPABASE: " + error.message);
        throw error;
      }

      console.log("DEBUG: Alertas configuradas recuperadas:", configs);
      
      let activeAlerts = (configs || [])
        .map(c => {
          // Soporta tanto si Supabase devuelve alert_types como objeto o como array
          const alertTypeObj = Array.isArray(c.alert_types) 
            ? c.alert_types[0] 
            : c.alert_types;

          if (!alertTypeObj) {
            console.log("DEBUG: Config sin alert_type en el record:", c);
            return null;
          }

          return {
            id: alertTypeObj.id,
            name: alertTypeObj.name,
            mqtt_command: alertTypeObj.mqtt_command,
            folder: alertTypeObj.folder || '1',
            filename: alertTypeObj.filename || '1',
            logo_url: alertTypeObj.logo_url,
            audio_url: alertTypeObj.audio_url
          };
        })
        .filter(Boolean);

      console.log("DEBUG: Alertas mapeadas con exito:", activeAlerts);

      // FALLBACK: Si no hay alertas habilitadas para este equipo en la BD, cargamos los mock de desarrollo
      if (!activeAlerts || activeAlerts.length === 0) {
        console.log("DEBUG: No hay alertas activas en DB para este equipo. Cargando mock fallback.");
        activeAlerts = [
          {
            id: 22,
            name: 'ALERTA ACOSO',
            mqtt_command: '2',
            folder: '01',
            filename: '022.mp3',
            logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.34251122646778.png',
          },
          {
            id: 21,
            name: 'APOYO SEGURIDAD',
            mqtt_command: '21',
            folder: '01',
            filename: '021.mp3',
            logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.44202624317780237.png',
          },
          {
            id: 1,
            name: 'ALERTA COMUNITARIA',
            mqtt_command: '1',
            folder: '01',
            filename: '001.mp3',
            logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.036984342417753724.jpg',
          },
          {
            id: 2,
            name: 'INCENDIO',
            mqtt_command: '2',
            folder: '01',
            filename: '002.mp3',
            logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.019638656330525195.jpg',
          }
        ];
      } else {
        // Alerta de diagnostico temporal para desarrollo
        alert(`🎯 ¡EXITO! Se cargaron ${activeAlerts.length} alertas reales desde la Base de Datos para este equipo.`);
      }

      // Consultar volumen y repeticiones de este dispositivo en tiempo real para sincronizar con la plataforma
      if (imei !== 'TEST-IMEI-5-ALERTS' && imei !== 'TEST-IMEI-20-ALERTS') {
        try {
          const { data: devInfo, error: devInfoError } = await supabase
            .from('devices_inventory')
            .select('imei, alias, lat, lng, volume_alerts, repetitions')
            .eq('imei', imei)
            .single();

          if (!devInfoError && devInfo) {
            console.log("DEBUG: 🔄 Sincronizados volumen y repeticiones desde la plataforma:", devInfo);
            // Actualiza selectedDevice y el dispositivo en la lista userDevices para coherencia completa
            this.setState(prevState => {
              const updatedDevices = prevState.userDevices.map(d => {
                if (d.imei === imei) {
                  return {
                    ...d,
                    volume_alerts: devInfo.volume_alerts,
                    repetitions: devInfo.repetitions,
                    alias: devInfo.alias,
                    lat: devInfo.lat,
                    lng: devInfo.lng
                  };
                }
                return d;
              });

              return {
                userDevices: updatedDevices,
                selectedDevice: {
                  ...prevState.selectedDevice,
                  volume_alerts: devInfo.volume_alerts,
                  repetitions: devInfo.repetitions,
                  alias: devInfo.alias,
                  lat: devInfo.lat,
                  lng: devInfo.lng
                }
              };
            });
          }
        } catch (infoErr) {
          console.warn("DEBUG: No se pudo sincronizar datos del dispositivo:", infoErr.message);
        }
      }

      this.setState({ activeAlerts });
    } catch (err) {
      console.warn("DEBUG: Error cargando alertas del equipo. Cargando mock fallback para desarrollo:", err.message);
      
      const mockAlerts = [
        {
          id: 22,
          name: 'ALERTA ACOSO',
          mqtt_command: '2',
          folder: '01',
          filename: '022.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.34251122646778.png',
        },
        {
          id: 21,
          name: 'APOYO SEGURIDAD',
          mqtt_command: '21',
          folder: '01',
          filename: '021.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.44202624317780237.png',
        },
        {
          id: 1,
          name: 'ALERTA COMUNITARIA',
          mqtt_command: '1',
          folder: '01',
          filename: '001.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.036984342417753724.jpg',
        },
        {
          id: 2,
          name: 'INCENDIO',
          mqtt_command: '2',
          folder: '01',
          filename: '002.mp3',
          logo_url: 'https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.019638656330525195.jpg',
        }
      ];
      this.setState({ activeAlerts: mockAlerts });
    } finally {
      this.setState({ loadingAlerts: false });
    }
  };

  connectMQTT = () => {
    const options = {
      clientId: 'veci_app_' + Math.random().toString(16).substr(2, 8),
      username: 'VeciSeguro',
      password: 'Mofnem-xubcyd-gizro1',
      clean: true,
    };

    // Usamos el host y puerto de tu configuración real
    const client = mqtt.connect('wss://a2467217.ala.us-east-1.emqxsl.com:8084/mqtt', options);

    client.on('connect', () => {
      console.log('DEBUG: ✅ App conectada a la Sirena (MQTT)');
      this.setState({ mqttClient: client });
    });

    client.on('error', (err) => {
      console.log('DEBUG: ❌ Error MQTT:', err.message);
    });
  };

  handleTriggerAlert = async (alertItem) => {
    this.setState({ loading: true });
    try {
      let location = null;
      try {
        const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
        location = await Promise.race([locationPromise, timeoutPromise]);
        if (!location) {
          location = await Location.getLastKnownPositionAsync();
        }
      } catch (locErr) {
        console.warn("DEBUG: Error obteniendo ubicación:", locErr);
      }

      const { userProfile, savedPhone, mqttClient, selectedDevice } = this.state;
      const activeImei = selectedDevice ? selectedDevice.imei : '80:F1:B2:D3:5C:2C';
      const reps = selectedDevice?.repetitions || 3;
      // Toma el volumen y repeticiones directamente de la base de datos/plataforma
      const volume = selectedDevice?.volume_alerts || 20;

      // 1. DISPARAR SIRENA FÍSICA (MQTT)
      if (mqttClient) {
        const payload = JSON.stringify({ 
          "Comando": 12, 
          "Consecutivo": 1,
          "Trama": [
            parseInt(alertItem.folder || 1),
            parseInt(alertItem.filename || 1),
            reps,
            volume
          ]
        });
        mqttClient.publish(`veciseguro/${activeImei}/cmd`, payload);
        console.log(`DEBUG: 🚨 Alerta "${alertItem.name}" enviada a la Sirena Física (${activeImei}) con Trama:`, payload);
      }

      // 2. REGISTRAR EN LA WEB (Supabase) con timeout resiliente de 2.5s para evitar bloqueos
      try {
        const insertPromise = supabase
          .from('alert_logs')
          .insert([
            { 
              imei: activeImei, 
              alert_name: alertItem.name.toUpperCase(), 
              user_id: (userProfile && !userProfile.isMock) ? userProfile.id : null, 
              metadata: {
                user_name: userProfile?.full_name || 'Vecino desde App',
                phone: userProfile?.phone || savedPhone || 'No registrado',
                location: 'Ubicación Móvil',
                status: 'active',
                latitude: location?.coords?.latitude || 0,
                longitude: location?.coords?.longitude || 0,
                accuracy: location?.coords?.accuracy || 0,
                folder: alertItem.folder,
                filename: alertItem.filename
              }
            }
          ]);

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout de base de datos")), 2500)
        );

        const { error } = await Promise.race([insertPromise, timeoutPromise]);
        if (error) throw error;
        console.log("DEBUG: ✅ Alerta registrada exitosamente en Supabase");
      } catch (dbErr) {
        console.warn("DEBUG: ⚠️ Registro en base de datos omitido o demorado:", dbErr.message);
      }

      alert(`¡ALERTA "${alertItem.name}" ENVIADA Y SIRENA ACTIVADA!`);
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      this.setState({ loading: false });
    }
  };

  render() {
    const { loading, userProfile, savedPhone, activeAlerts } = this.state;
    const primaryAlert = (activeAlerts && activeAlerts.length > 0) ? activeAlerts[0] : null;
    const hasLogo = primaryAlert && primaryAlert.logo_url;
    const quickAlerts = (activeAlerts && activeAlerts.length > 1) ? activeAlerts.slice(1, 4) : [];
    const remainingAlerts = (activeAlerts && activeAlerts.length > 4) ? activeAlerts.slice(4) : [];

    return (
      <Block flex center style={styles.home}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.articles}>
          
          {/* Cabecera Unificada y Elegante */}
          <Block row middle space="between" style={{ marginTop: 20, width: '100%', paddingHorizontal: 4 }}>
            <Block>
              <Text bold size={22} color={argonTheme.COLORS.PRIMARY} style={{ letterSpacing: 0.5 }}>VECISEGURO</Text>
              <Block row middle style={{ marginTop: 3 }}>
                <Block style={styles.statusDot} />
                <Text size={11} color={argonTheme.COLORS.MUTED}>SISTEMA ONLINE</Text>
              </Block>
            </Block>
            {userProfile && (
              <Block row middle style={{ backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E9ECEF' }}>
                <Icon name="user" family="Entypo" size={12} color={argonTheme.COLORS.PRIMARY} />
                <Text bold size={12} color={argonTheme.COLORS.PRIMARY} style={{ marginLeft: 5 }}>
                  {userProfile.full_name.split(' ')[0]}
                </Text>
              </Block>
            )}
          </Block>

          {/* Selector Horizontal de Equipos (Fácil acceso superior) */}
          <Block style={{ marginTop: 20, marginBottom: 5, width: '100%' }}>
            <Text bold size={11} color={argonTheme.COLORS.MUTED} style={{ letterSpacing: 0.5, marginBottom: 10 }}>
              SELECCIONA TU SIRENA ACTIVA:
            </Text>
            {this.state.userDevices && this.state.userDevices.length > 0 ? (
              <Block>
                {this.state.userDevices.length > 1 && (
                  <Input
                    right
                    color="black"
                    style={styles.searchBar}
                    placeholder="Buscar equipo por alias o IMEI..."
                    placeholderTextColor="#8898AA"
                    value={this.state.deviceSearchQuery}
                    onChangeText={(text) => this.setState({ deviceSearchQuery: text })}
                    iconContent={<Icon size={14} name="search" family="Feather" color="#8898AA" />}
                  />
                )}
                {(() => {
                  const filteredDevs = this.state.userDevices.filter(dev => 
                    (dev.alias || '').toLowerCase().includes(this.state.deviceSearchQuery.toLowerCase()) ||
                    (dev.imei || '').toLowerCase().includes(this.state.deviceSearchQuery.toLowerCase())
                  );
                  if (filteredDevs.length === 0) {
                    return (
                      <Text size={12} color="#8898AA" style={{ fontStyle: 'italic', paddingVertical: 10 }}>
                        No se encontraron equipos para la búsqueda.
                      </Text>
                    );
                  }
                  return (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20, paddingBottom: 5 }}>
                      {filteredDevs.map((dev) => {
                        const isSelected = this.state.selectedDevice?.imei === dev.imei;
                        return (
                          <TouchableOpacity 
                            key={dev.imei}
                            onPress={() => {
                              this.setState({ selectedDevice: dev });
                              this.loadDeviceAlerts(dev.imei);
                            }}
                            style={[
                              styles.horizontalDeviceCard, 
                              isSelected && { borderColor: argonTheme.COLORS.PRIMARY, backgroundColor: '#EBF0FF' }
                            ]}
                          >
                            <Icon 
                              name="sound" 
                              family="Entypo" 
                              size={16} 
                              color={isSelected ? argonTheme.COLORS.PRIMARY : "#8898AA"} 
                            />
                            <Block style={{ marginLeft: 8 }}>
                              <Text bold size={13} color={isSelected ? argonTheme.COLORS.PRIMARY : "#32325D"}>
                                {dev.alias}
                              </Text>
                              <Text size={9} color={isSelected ? argonTheme.COLORS.PRIMARY : "#8898AA"} style={{ marginTop: 1, opacity: isSelected ? 0.8 : 1 }}>
                                {dev.imei.substring(0, 14)}...
                              </Text>
                            </Block>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  );
                })()}
              </Block>
            ) : (
              <Text size={12} color="#8898AA" style={{ fontStyle: 'italic' }}>
                No tienes equipos asignados en la plataforma.
              </Text>
            )}
          </Block>

          <Block center style={styles.panicContainer}>
            <Animated.View style={{ transform: [{ scale: this.state.isPressed }] }}>
              <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => {
                  alert("⚠️ ¡MANTÉN PRESIONADO!\n\nPara evitar falsas alertas, debes mantener presionado este botón durante 1.5 segundos para activar la sirena.");
                }}
                delayLongPress={1500}
                onLongPress={async () => {
                  Animated.sequence([
                    Animated.timing(this.state.isPressed, { toValue: 0.8, duration: 100, useNativeDriver: true }),
                    Animated.spring(this.state.isPressed, { toValue: 1, friction: 3, useNativeDriver: true })
                  ]).start();
                  
                  // El botón de pánico grande dispara inteligentemente la primera alerta activa configurada
                  if (primaryAlert) {
                    await this.handleTriggerAlert(primaryAlert);
                  } else {
                    // Fallback clásico si la base de datos aún no ha cargado alertas
                    await this.handleTriggerAlert({
                      id: 'panic_general',
                      name: 'BOTÓN DE PÁNICO',
                      folder: '1',
                      filename: '2'
                    });
                  }
                }}
                style={[
                  styles.panicButton,
                  primaryAlert ? { 
                    backgroundColor: 'transparent', 
                    borderColor: getAlertColors(primaryAlert.name).border,
                    borderWidth: 10
                  } : {
                    backgroundColor: 'transparent',
                    borderColor: '#EF4444',
                    borderWidth: 10
                  }
                ]}
              >
                <Block center middle>
                  {loading ? (
                    <ActivityIndicator size="large" color={primaryAlert ? getAlertColors(primaryAlert.name).border : '#EF4444'} />
                  ) : (
                    <>
                      {hasLogo && primaryAlert && !this.state.imageErrors[primaryAlert.id] ? (
                        <Image
                          source={{ uri: primaryAlert.logo_url }}
                          style={{
                            width: 176,
                            height: 176,
                            borderRadius: 88,
                          }}
                          resizeMode="cover"
                          onError={() => {
                            console.log("DEBUG: Error cargando imagen remota del panic button. Activando fallback.");
                            this.setState(prev => ({
                              imageErrors: { ...prev.imageErrors, [primaryAlert.id]: true }
                            }));
                          }}
                        />
                      ) : (
                        <>
                          <Icon 
                            name={getAlertIcon(primaryAlert?.name).name} 
                            family={getAlertIcon(primaryAlert?.name).family} 
                            size={70} 
                            color={primaryAlert ? getAlertColors(primaryAlert.name).border : '#EF4444'} 
                          />
                          <Text bold size={18} color={primaryAlert ? getAlertColors(primaryAlert.name).text : '#EF4444'} style={{ marginTop: 8 }}>PÁNICO</Text>
                        </>
                      )}
                    </>
                  )}
                </Block>
              </TouchableOpacity>
            </Animated.View>

            {/* TEXTO EXPLICATIVO DE LA ALERTA PRINCIPAL */}
            {primaryAlert && (
              <Block center style={{ marginTop: 15 }}>
                <Text bold size={20} color={getAlertColors(primaryAlert.name).text} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {primaryAlert.name}
                </Text>
                <Text bold size={11} color="#525F7F" style={{ marginTop: 4, letterSpacing: 0.5 }}>
                  MANTÉN PRESIONADO PARA ACTIVAR SIRENA
                </Text>
              </Block>
            )}
          </Block>

          {/* Seccion de 3 Iconos Medios en Fila (Prioridades 2, 3 y 4) */}
          {quickAlerts && quickAlerts.length > 0 && (
            <Block row space="around" style={{ width: '100%', paddingHorizontal: 10, marginVertical: 15 }}>
              {quickAlerts.map((alertItem) => {
                const colors = getAlertColors(alertItem.name);
                return (
                  <Block key={alertItem.id} center style={{ width: (width - 40) / 3 }}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        alert(`⚠️ ¡MANTÉN PRESIONADO!\n\nPara activar la alerta "${alertItem.name}", debes mantener presionado este botón durante 1.5 segundos.`);
                      }}
                      delayLongPress={1500}
                      onLongPress={() => this.handleTriggerAlert(alertItem)}
                      style={[
                        styles.mediumCircularButton,
                        { borderColor: colors.border }
                      ]}
                    >
                      {alertItem.logo_url && !this.state.imageErrors[alertItem.id] ? (
                        <Image
                          source={{ uri: alertItem.logo_url }}
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: 36,
                          }}
                          resizeMode="cover"
                          onError={() => {
                            this.setState(prev => ({
                              imageErrors: { ...prev.imageErrors, [alertItem.id]: true }
                            }));
                          }}
                        />
                      ) : (
                        <Icon 
                          name={getAlertIcon(alertItem.name).name} 
                          family={getAlertIcon(alertItem.name).family} 
                          size={24} 
                          color={colors.border} 
                        />
                      )}
                    </TouchableOpacity>
                    <Text bold size={10} color={colors.text} numberOfLines={1} style={{ marginTop: 6, textTransform: 'uppercase', textAlign: 'center' }}>
                      {alertItem.name}
                    </Text>
                  </Block>
                );
              })}
            </Block>
          )}

          {/* Seccion de Alertas Dinamicas Habilitadas (Restantes - Prioridad 5 en adelante) */}
          {(this.state.loadingAlerts || (remainingAlerts && remainingAlerts.length > 0)) && (
            <Block flex style={{ marginTop: 15, marginBottom: 15 }}>
              <Text bold size={11} color={argonTheme.COLORS.MUTED} style={{ marginBottom: 12, letterSpacing: 0.5 }}>
                ¿QUÉ ESTÁ SUCEDIENDO? (ALERTAS ADICIONALES):
              </Text>

              {this.state.loadingAlerts ? (
                <Block middle style={{ padding: 25 }}>
                  <ActivityIndicator color={argonTheme.COLORS.PRIMARY} size="large" />
                </Block>
              ) : (
                <Block>
                  {remainingAlerts.length > 2 && (
                    <Input
                      right
                      color="black"
                      style={styles.searchBar}
                      placeholder="Buscar tipo de alerta..."
                      placeholderTextColor="#8898AA"
                      value={this.state.alertSearchQuery}
                      onChangeText={(text) => this.setState({ alertSearchQuery: text })}
                      iconContent={<Icon size={14} name="search" family="Feather" color="#8898AA" />}
                    />
                  )}
                  <Block style={{ gap: 8 }}>
                    {(() => {
                      const filtered = remainingAlerts.filter(a => 
                        (a.name || '').toLowerCase().includes(this.state.alertSearchQuery.toLowerCase())
                      );
                      if (filtered.length === 0) {
                        return (
                          <Text size={12} color="#8898AA" style={{ fontStyle: 'italic', paddingVertical: 10 }}>
                            No se encontraron alertas para la búsqueda.
                          </Text>
                        );
                      }
                      return filtered.map((alertItem) => {
                        const colors = getAlertColors(alertItem.name);
                        const isCompact = this.state.activeAlerts.length > 6;
                        return (
                          <TouchableOpacity
                            key={alertItem.id}
                            onPress={() => {
                              alert(`⚠️ ¡MANTÉN PRESIONADO!\n\nPara activar la alerta "${alertItem.name}", debes mantener presionado este botón durante 1.5 segundos.`);
                            }}
                            delayLongPress={1500}
                            onLongPress={() => this.handleTriggerAlert(alertItem)}
                            style={[
                              styles.alertRowCard, 
                              { backgroundColor: 'white', borderColor: colors.border },
                              isCompact && { padding: 8, marginBottom: 6, borderRadius: 12 }
                            ]}
                          >
                            <Block row middle space="between" style={{ width: '100%' }}>
                              <Block row middle style={{ flex: 1 }}>
                                <Block center middle style={[
                                  styles.alertRowIconContainer, 
                                  { borderColor: colors.border, backgroundColor: 'transparent', borderWidth: 2 },
                                  isCompact && { width: 36, height: 36, borderRadius: 18 }
                                ]}>
                                  {alertItem.logo_url && !this.state.imageErrors[alertItem.id] ? (
                                    <Image
                                      source={{ uri: alertItem.logo_url }}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                      }}
                                      resizeMode="cover"
                                      onError={() => {
                                        console.log("DEBUG: Error cargando logo para:", alertItem.name, ". Activando fallback.");
                                        this.setState(prev => ({
                                          imageErrors: { ...prev.imageErrors, [alertItem.id]: true }
                                        }));
                                      }}
                                    />
                                  ) : (
                                    <Icon 
                                      name={getAlertIcon(alertItem.name).name} 
                                      family={getAlertIcon(alertItem.name).family} 
                                      size={isCompact ? 20 : 26} 
                                      color={colors.border} 
                                    />
                                  )}
                                </Block>
                                <Block style={{ marginLeft: isCompact ? 10 : 15, flex: 1 }}>
                                  <Text bold size={isCompact ? 12 : 14} color={colors.text} style={{ textTransform: 'uppercase' }}>
                                    {alertItem.name}
                                  </Text>
                                  <Text size={isCompact ? 9 : 11} color="#525F7F" style={{ marginTop: isCompact ? 1 : 2 }}>
                                    Mantén presionado para activar sirena
                                  </Text>
                                </Block>
                              </Block>
                              <Block style={[
                                styles.alertActionPill, 
                                { backgroundColor: colors.border },
                                isCompact && { width: 24, height: 24, borderRadius: 12 }
                              ]}>
                                <Icon name="chevron-right" family="Entypo" size={isCompact ? 12 : 16} color="white" />
                              </Block>
                            </Block>
                          </TouchableOpacity>
                        );
                      });
                    })()}
                  </Block>
                </Block>
              )}
            </Block>
          )}

          {/* Pie de Página Minimalista */}
          <Block center style={{ marginTop: 15, marginBottom: 20 }}>
            <Text size={10} color={argonTheme.COLORS.MUTED} style={{ opacity: 0.5 }}>
              VeciSeguro App v4.5.2 • Protegiendo a tu Comunidad
            </Text>
          </Block>

        </ScrollView>
      </Block>
    );
  }
}

const styles = StyleSheet.create({
  home: { width: width, backgroundColor: '#F8F9FE' },
  articles: { width: width - theme.SIZES.BASE * 2, paddingVertical: theme.SIZES.BASE },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginRight: 6 },
  panicContainer: { marginVertical: 20, justifyContent: 'center', alignItems: 'center' },
  panicButton: {
    width: 200, height: 200, borderRadius: 100, backgroundColor: '#EF4444',
    justifyContent: 'center', alignItems: 'center', elevation: 15, borderWidth: 8, borderColor: 'rgba(255,255,255,0.3)'
  },
  quickActions: { marginTop: 20, marginBottom: 30 },
  actionCard: { width: (width - 60) / 3, height: 80, borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  statsCard: { backgroundColor: 'white', padding: 20, borderRadius: 16, elevation: 2 },
  horizontalDeviceCard: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E9ECEF',
    backgroundColor: 'white',
    marginRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 0.05,
  },
  deviceItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginTop: 10,
    backgroundColor: '#F8F9FE'
  },
  deviceItemSelected: {
    borderColor: argonTheme.COLORS.PRIMARY,
    backgroundColor: 'rgba(94, 114, 228, 0.05)',
  },
  selectedBadge: {
    backgroundColor: argonTheme.COLORS.PRIMARY,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  alertRowCard: {
    width: '100%',
    borderRadius: 16,
    padding: 11,
    borderWidth: 1.5,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.06,
    marginBottom: 8,
  },
  alertRowIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    overflow: 'hidden',
    borderWidth: 1,
  },
  alertRowLogo: {
    width: '100%',
    height: '100%',
  },
  alertActionPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  searchBar: {
    height: 40,
    borderColor: '#E9ECEF',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  mediumCircularButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.1,
    overflow: 'hidden',
  }
});

export default Home;
