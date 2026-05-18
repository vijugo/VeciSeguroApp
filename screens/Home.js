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

const getAlertColors = (name, darkMode = true) => {
  const norm = (name || '').toLowerCase();
  if (norm.includes('acoso') || norm.includes('bullying')) {
    return darkMode 
      ? { bg: '#1E1B4B', border: '#6366F1', text: '#818CF8', accent: '#6366F1' }
      : { bg: '#EEF2FF', border: '#4F46E5', text: '#4F46E5', accent: '#4F46E5' };
  }
  if (norm.includes('apoyo') || norm.includes('seguridad') || norm.includes('polic') || norm.includes('vigil')) {
    return darkMode
      ? { bg: '#172554', border: '#3B82F6', text: '#60A5FA', accent: '#3B82F6' }
      : { bg: '#EFF6FF', border: '#1D4ED8', text: '#1D4ED8', accent: '#1D4ED8' };
  }
  if (norm.includes('comun') || norm.includes('panic') || norm.includes('pánico') || norm.includes('general')) {
    return darkMode
      ? { bg: '#450A0A', border: '#EF4444', text: '#F87171', accent: '#EF4444' }
      : { bg: '#FEF2F2', border: '#DC2626', text: '#DC2626', accent: '#DC2626' };
  }
  if (norm.includes('fuego') || norm.includes('incend') || norm.includes('bomber')) {
    return darkMode
      ? { bg: '#431407', border: '#F97316', text: '#FB923C', accent: '#F97316' }
      : { bg: '#FFF7ED', border: '#EA580C', text: '#EA580C', accent: '#EA580C' };
  }
  if (norm.includes('medica') || norm.includes('salud') || norm.includes('enferm') || norm.includes('apoyo m')) {
    return darkMode
      ? { bg: '#064E3B', border: '#10B981', text: '#34D399', accent: '#10B981' }
      : { bg: '#ECFDF5', border: '#059669', text: '#059669', accent: '#059669' };
  }
  return darkMode
    ? { bg: '#111827', border: '#9CA3AF', text: '#D1D5DB', accent: '#9CA3AF' }
    : { bg: '#F8FAFC', border: '#475569', text: '#475569', accent: '#475569' };
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

// Map local bundled assets (designed by Banana) for instant zero-latency loading
const ALERT_LOCAL_IMAGES = {
  'Alerta Acoso': require('../assets/imgs/alerta_acoso.png'),
  'Alerta Comunitaria': require('../assets/imgs/alerta_comunitaria.png'),
  'Apoyo Seguridad U': require('../assets/imgs/alerta_seguridad.png'),
  'Incendio': require('../assets/imgs/alerta_incendio.png'),
  'Enfermería': require('../assets/imgs/alerta_enfermeria.png'),
};

const getAlertImageSource = (alertItem) => {
  if (!alertItem) return null;
  const name = alertItem.name || '';
  // Check if we have a bundled local asset with that name
  if (ALERT_LOCAL_IMAGES[name]) {
    return ALERT_LOCAL_IMAGES[name];
  }
  // Try clean substrings to match
  for (const key of Object.keys(ALERT_LOCAL_IMAGES)) {
    if (name.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(name.toLowerCase())) {
      return ALERT_LOCAL_IMAGES[key];
    }
  }
  // Fallback to dynamic database URL if available
  if (alertItem.logo_url) {
    return { uri: alertItem.logo_url };
  }
  return null;
};

class Home extends React.Component {
  state = {
    pulseAnim: new Animated.Value(1),
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
    alertSearchQuery: '',
    darkMode: true
  };

  startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(this.state.pulseAnim, {
          toValue: 1.15,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(this.state.pulseAnim, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        })
      ])
    ).start();
  };

  async componentDidMount() {
    console.log("DEBUG: Home se ha montado.");
    
    // Iniciar animación del botón SOS
    this.startPulse();
    
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
        console.warn("DEBUG: ⚠️ ERROR SUPABASE FETCH:", error.message);
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
    const { loading, userProfile, savedPhone, activeAlerts, darkMode } = this.state;
    const primaryAlert = (activeAlerts && activeAlerts.length > 0) ? activeAlerts[0] : null;
    const hasLogo = primaryAlert && primaryAlert.logo_url;
    const quickAlerts = (activeAlerts && activeAlerts.length > 1) ? activeAlerts.slice(1, 4) : [];
    const remainingAlerts = (activeAlerts && activeAlerts.length > 4) ? activeAlerts.slice(4) : [];

    const themeColors = {
      background: darkMode ? '#0B0F19' : '#F8FAFC',
      textPrimary: darkMode ? '#FFFFFF' : '#1E293B',
      textSecondary: darkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(30, 41, 59, 0.6)',
      cardBackground: darkMode ? 'rgba(255, 255, 255, 0.03)' : '#FFFFFF',
      searchBackground: darkMode ? 'rgba(255, 255, 255, 0.05)' : '#FFFFFF',
      searchText: darkMode ? 'white' : '#1E293B',
      buttonBackground: darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
      activeDeviceBackground: darkMode ? 'rgba(99, 102, 241, 0.25)' : '#EEF2FF',
      activeDeviceText: darkMode ? '#818CF8' : '#4F46E5',
      deviceCardBorderColor: darkMode ? 'transparent' : 'rgba(0, 0, 0, 0.06)',
      deviceCardBorderWidth: darkMode ? 0 : 1,
      searchBorderColor: darkMode ? 'transparent' : '#E2E8F0',
      searchBorderWidth: darkMode ? 0 : 1,
      alertCardBorderColor: darkMode ? 'transparent' : '#F1F5F9',
      alertCardBorderWidth: darkMode ? 0 : 1,
      panicButtonShadowColor: darkMode ? (primaryAlert ? getAlertColors(primaryAlert.name, true).border : '#EF4444') : '#000000',
      panicButtonShadowOpacity: darkMode ? 0.12 : 0.05,
      panicButtonShadowRadius: darkMode ? 18 : 16,
    };

    return (
      <Block flex style={[styles.home, { backgroundColor: themeColors.background }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.articles}>
          
          {/* Cabecera Unificada y Elegante */}
          <Block row middle space="between" style={{ marginTop: 20, width: '100%', paddingHorizontal: 4 }}>
            <Block row middle>
              <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => this.props.navigation.openDrawer()}
                style={{ 
                  marginRight: 12, 
                  backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', 
                  padding: 8, 
                  borderRadius: 20 
                }}
              >
                <Icon 
                  name="menu" 
                  family="Entypo" 
                  size={16} 
                  color={themeColors.textPrimary} 
                />
              </TouchableOpacity>
              <Block>
                <Text bold size={22} color={themeColors.textPrimary} style={{ letterSpacing: 0.5 }}>VECISEGURO</Text>
                <Block row middle style={{ marginTop: 3 }}>
                  <Block style={styles.statusDot} />
                  <Text size={11} color={themeColors.textSecondary}>SISTEMA ONLINE</Text>
                </Block>
              </Block>
            </Block>
            <Block row middle>
              <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => this.setState({ darkMode: !darkMode })}
                style={{ 
                  marginRight: 10, 
                  backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', 
                  padding: 8, 
                  borderRadius: 20 
                }}
              >
                <Icon 
                  name={darkMode ? "light-up" : "moon"} 
                  family="Entypo" 
                  size={14} 
                  color={darkMode ? "#FBBF24" : "#475569"} 
                />
              </TouchableOpacity>
              {userProfile && (
                <Block row middle style={{ backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                  <Icon name="user" family="Entypo" size={12} color={themeColors.textPrimary} />
                  <Text bold size={12} color={themeColors.textPrimary} style={{ marginLeft: 5 }}>
                    {userProfile.full_name.split(' ')[0]}
                  </Text>
                </Block>
              )}
            </Block>
          </Block>

          {/* Selector Horizontal de Equipos (Fácil acceso superior) */}
          <Block style={{ marginTop: 20, marginBottom: 5, width: '100%' }}>
            <Text bold size={11} color={themeColors.textSecondary} style={{ letterSpacing: 0.5, marginBottom: 10 }}>
              SELECCIONA TU SIRENA ACTIVA:
            </Text>
            {this.state.userDevices && this.state.userDevices.length > 0 ? (
              <Block>
                {this.state.userDevices.length > 1 && (
                  <Input
                    right
                    color={themeColors.searchText}
                    style={[
                      styles.searchBar, 
                      { 
                        backgroundColor: themeColors.searchBackground, 
                        color: themeColors.searchText,
                        borderColor: themeColors.searchBorderColor,
                        borderWidth: themeColors.searchBorderWidth
                      }
                    ]}
                    placeholder="Buscar equipo por alias o IMEI..."
                    placeholderTextColor={darkMode ? "rgba(255, 255, 255, 0.3)" : "rgba(30, 41, 59, 0.4)"}
                    value={this.state.deviceSearchQuery}
                    onChangeText={(text) => this.setState({ deviceSearchQuery: text })}
                    iconContent={<Icon size={14} name="search" family="Feather" color={themeColors.textSecondary} />}
                  />
                )}
                {(() => {
                  const filteredDevs = this.state.userDevices.filter(dev => 
                    (dev.alias || '').toLowerCase().includes(this.state.deviceSearchQuery.toLowerCase()) ||
                    (dev.imei || '').toLowerCase().includes(this.state.deviceSearchQuery.toLowerCase())
                  );
                      if (filteredDevs.length === 0) {
                        return (
                          <Text size={12} color={themeColors.textSecondary} style={{ fontStyle: 'italic', paddingVertical: 10 }}>
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
                                  { 
                                    backgroundColor: themeColors.cardBackground,
                                    borderColor: isSelected ? themeColors.activeDeviceText : themeColors.deviceCardBorderColor,
                                    borderWidth: isSelected ? 1.5 : themeColors.deviceCardBorderWidth
                                  },
                                  isSelected && { backgroundColor: themeColors.activeDeviceBackground }
                                ]}
                              >
                                <Icon 
                                  name="sound" 
                                  family="Entypo" 
                                  size={16} 
                                  color={isSelected ? themeColors.activeDeviceText : themeColors.textSecondary} 
                                />
                                <Block style={{ marginLeft: 8 }}>
                                  <Text bold size={13} color={isSelected ? themeColors.activeDeviceText : themeColors.textPrimary}>
                                    {dev.alias}
                                  </Text>
                                  <Text size={9} color={isSelected ? themeColors.activeDeviceText : themeColors.textSecondary} style={{ marginTop: 1, opacity: isSelected ? 0.8 : 1 }}>
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
                  <Text size={12} color={themeColors.textSecondary} style={{ fontStyle: 'italic' }}>
                    No tienes equipos asignados en la plataforma.
                  </Text>
            )}
          </Block>

          <Block center style={styles.panicContainer}>
            {/* Anillos concéntricos de respiración/pulsación neón */}
            <Animated.View 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 250,
                height: 250,
                borderRadius: 125,
                backgroundColor: primaryAlert ? getAlertColors(primaryAlert.name, darkMode).border : '#EF4444',
                opacity: this.state.pulseAnim.interpolate({
                  inputRange: [1, 1.15],
                  outputRange: [0.15, 0.02]
                }),
                transform: [{ scale: this.state.pulseAnim }]
              }}
            />
            <Animated.View 
              style={{
                position: 'absolute',
                top: 15,
                left: 15,
                width: 220,
                height: 220,
                borderRadius: 110,
                backgroundColor: primaryAlert ? getAlertColors(primaryAlert.name, darkMode).border : '#EF4444',
                opacity: this.state.pulseAnim.interpolate({
                  inputRange: [1, 1.15],
                  outputRange: [0.25, 0.04]
                }),
                transform: [{ scale: this.state.pulseAnim.interpolate({
                  inputRange: [1, 1.15],
                  outputRange: [1.02, 1.08]
                }) }]
              }}
            />

            <Animated.View style={{ 
              position: 'absolute',
              top: 25,
              left: 25,
              width: 200,
              height: 200,
              transform: [{ scale: this.state.isPressed }] 
            }}>
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
                  {
                    shadowColor: themeColors.panicButtonShadowColor,
                    shadowOpacity: themeColors.panicButtonShadowOpacity,
                    shadowRadius: themeColors.panicButtonShadowRadius,
                  },
                  (hasLogo && primaryAlert && !this.state.imageErrors[primaryAlert.id]) ? {
                    backgroundColor: 'transparent',
                  } : (primaryAlert ? { 
                    backgroundColor: getAlertColors(primaryAlert.name, darkMode).border,
                  } : {
                    backgroundColor: '#EF4444',
                  })
                ]}
              >
                <Block center middle>
                  {loading ? (
                    <ActivityIndicator size="large" color="white" />
                  ) : (
                    <>
                      {primaryAlert && getAlertImageSource(primaryAlert) && !this.state.imageErrors[primaryAlert.id] ? (
                        <Image
                          source={getAlertImageSource(primaryAlert)}
                          style={{
                            width: 200,
                            height: 200,
                            borderRadius: 100,
                          }}
                          resizeMode="cover"
                          onError={() => {
                            console.log("DEBUG: Error cargando imagen del panic button. Activando fallback.");
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
                            color="white" 
                          />
                          <Text bold size={18} color="white" style={{ marginTop: 8 }}>PÁNICO</Text>
                        </>
                      )}
                    </>
                  )}
                </Block>
              </TouchableOpacity>
            </Animated.View>
          </Block>

          {/* TEXTO EXPLICATIVO DE LA ALERTA PRINCIPAL */}
          {primaryAlert && (
            <Block center style={{ marginTop: 15 }}>
              <Text bold size={20} color={getAlertColors(primaryAlert.name, darkMode).text} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {primaryAlert.name}
              </Text>
              <Text bold size={11} color={themeColors.textSecondary} style={{ marginTop: 4, letterSpacing: 0.5 }}>
                MANTÉN PRESIONADO PARA ACTIVAR SIRENA
              </Text>
            </Block>
          )}

          {/* Seccion de 3 Iconos Medios en Fila (Prioridades 2, 3 y 4) */}
          {quickAlerts && quickAlerts.length > 0 && (
            <Block row space="around" style={{ width: '100%', paddingHorizontal: 10, marginVertical: 15 }}>
              {quickAlerts.map((alertItem) => {
                const colors = getAlertColors(alertItem.name, darkMode);
                return (
                  <Block key={alertItem.id} center style={{ width: (width - 40) / 3 }}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        alert(`⚠️ ¡MANTÉN PRESIONADO!\n\nPara activar la alerta "${alertItem.name}", debes mantener presionado este botón durante 1.5 segundos.`);
                      }}
                      delayLongPress={1500}
                      onLongPress={() => this.handleTriggerAlert(alertItem)}
                      style={styles.mediumCircularButton}
                    >
                      {getAlertImageSource(alertItem) && !this.state.imageErrors[alertItem.id] ? (
                        <Image
                          source={getAlertImageSource(alertItem)}
                          style={{
                            width: 76,
                            height: 76,
                            borderRadius: 38,
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
                          size={44} 
                          color={colors.text} 
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
              <Text bold size={11} color={themeColors.textSecondary} style={{ marginBottom: 12, letterSpacing: 0.5 }}>
                ¿QUÉ ESTÁ SUCEDIENDO? (ALERTAS ADICIONALES):
              </Text>

              {this.state.loadingAlerts ? (
                <Block middle style={{ padding: 25 }}>
                  <ActivityIndicator color="#6366F1" size="large" />
                </Block>
              ) : (
                <Block>
                  {remainingAlerts.length > 2 && (
                    <Input
                      right
                      color={themeColors.searchText}
                      style={[
                        styles.searchBar, 
                        { 
                          backgroundColor: themeColors.searchBackground, 
                          color: themeColors.searchText,
                          borderColor: themeColors.searchBorderColor,
                          borderWidth: themeColors.searchBorderWidth
                        }
                      ]}
                      placeholder="Buscar tipo de alerta..."
                      placeholderTextColor={darkMode ? "rgba(255, 255, 255, 0.3)" : "rgba(30, 41, 59, 0.4)"}
                      value={this.state.alertSearchQuery}
                      onChangeText={(text) => this.setState({ alertSearchQuery: text })}
                      iconContent={<Icon size={14} name="search" family="Feather" color={themeColors.textSecondary} />}
                    />
                  )}
                  <Block>
                    {(() => {
                      const filtered = remainingAlerts.filter(a => 
                        (a.name || '').toLowerCase().includes(this.state.alertSearchQuery.toLowerCase())
                      );
                      if (filtered.length === 0) {
                        return (
                          <Text size={12} color={themeColors.textSecondary} style={{ fontStyle: 'italic', paddingVertical: 10 }}>
                            No se encontraron alertas para la búsqueda.
                          </Text>
                        );
                      }
                      return (
                        <Block row style={{ flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' }}>
                          {filtered.map((alertItem) => {
                            const colors = getAlertColors(alertItem.name, darkMode);
                            const hasImage = getAlertImageSource(alertItem) && !this.state.imageErrors[alertItem.id];
                            return (
                              <TouchableOpacity
                                key={alertItem.id}
                                onPress={() => {
                                  alert(`⚠️ ¡MANTÉN PRESIONADO!\n\nPara activar la alerta "${alertItem.name}", debes mantener presionado este botón durante 1.5 segundos.`);
                                }}
                                delayLongPress={1500}
                                onLongPress={() => this.handleTriggerAlert(alertItem)}
                                style={[
                                  styles.gridAlertCard,
                                  {
                                    backgroundColor: colors.bg,
                                    borderColor: colors.border,
                                    borderWidth: 2,
                                    shadowColor: colors.border,
                                  }
                                ]}
                              >
                                <Block center middle style={{ width: '100%', height: '100%' }}>
                                  {/* ICON / IMAGE CONTAINER */}
                                  <Block center middle style={[
                                    styles.gridIconContainer,
                                    { backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', marginBottom: 6 }
                                  ]}>
                                    {hasImage ? (
                                      <Image
                                        source={getAlertImageSource(alertItem)}
                                        style={{ width: 44, height: 44, borderRadius: 22 }}
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
                                        size={28} 
                                        color={colors.text} 
                                      />
                                    )}
                                  </Block>

                                  {/* TEXT LABEL */}
                                  <Text bold size={11} color={colors.text} style={{ textTransform: 'uppercase', textAlign: 'center', letterSpacing: 0.5, paddingHorizontal: 4 }} numberOfLines={1}>
                                    {alertItem.name}
                                  </Text>
                                  </Block>
                              </TouchableOpacity>
                            );
                          })}
                        </Block>
                      );
                    })()}
                  </Block>
                </Block>
              )}
            </Block>
          )}

          {/* Pie de Página Minimalista */}
          <Block center style={{ marginTop: 15, marginBottom: 20 }}>
            <Text size={10} color={themeColors.textSecondary} style={{ opacity: 0.5 }}>
              VeciSeguro App v4.5.2 • Protegiendo a tu Comunidad
            </Text>
          </Block>

        </ScrollView>
      </Block>
    );
  }
}

const styles = StyleSheet.create({
  home: { width: '100%', flex: 1, backgroundColor: 'transparent' },
  articles: { paddingHorizontal: 16, paddingVertical: theme.SIZES.BASE },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginRight: 6 },
  panicContainer: { 
    marginVertical: 20, 
    justifyContent: 'center', 
    alignItems: 'center',
    width: 250,
    height: 250,
    alignSelf: 'center',
  },
  panicButton: {
    width: 200, height: 200, borderRadius: 100,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 18,
    shadowOpacity: 0.12,
    elevation: 6
  },
  quickActions: { marginTop: 20, marginBottom: 30 },
  actionCard: { width: (width - 60) / 3, height: 80, borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  statsCard: { backgroundColor: 'white', padding: 20, borderRadius: 16, elevation: 2 },
  horizontalDeviceCard: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    shadowOpacity: 0.04,
    elevation: 2,
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
  gridAlertCard: {
    width: '48%',
    height: 125,
    borderRadius: 20,
    padding: 10,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    shadowOpacity: 0.12,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  alertRowCard: {
    width: '100%',
    borderRadius: 20,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    shadowOpacity: 0.05,
    elevation: 3,
  },
  alertRowIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    overflow: 'hidden',
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
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 10,
    paddingHorizontal: 12,
    color: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    shadowOpacity: 0.04,
    elevation: 1,
  },
  mediumCircularButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    shadowOpacity: 0.08,
    elevation: 3,
  }
});

export default Home;
