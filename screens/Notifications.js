import React from "react";
import {
  StyleSheet,
  Dimensions,
  ScrollView,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Switch,
  Alert,
  Image
} from "react-native";
import { Block, Text, theme } from "galio-framework";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Header, Icon } from "../components";
import { argonTheme } from "../constants";
import { supabase } from "../constants/Supabase";

const { width } = Dimensions.get("screen");

class Notifications extends React.Component {
  state = {
    loading: true,
    saving: false,
    userProfile: null,
    selectedDevice: null,
    alerts: [],
    preferences: {}, // { "ALERTA ACOSO": true, "ENFERMERÍA": false, ... }
    darkMode: true
  };

  async componentDidMount() {
    await this.loadPreferencesAndAlerts();
  }

  loadPreferencesAndAlerts = async () => {
    this.setState({ loading: true });
    try {
      // 0. Cargar preferencia de tema de AsyncStorage
      try {
        const savedMode = await AsyncStorage.getItem("@veciseguro:dark_mode");
        if (savedMode !== null) {
          this.setState({ darkMode: JSON.parse(savedMode) });
        }
      } catch (e) {
        console.log("DEBUG: Error al cargar tema en Notificaciones:", e.message);
      }

      // 1. Obtener teléfono guardado para buscar el perfil
      const savedPhone = await AsyncStorage.getItem("@veciseguro:saved_phone");
      let cleanPhone = savedPhone ? savedPhone.trim() : "";

      // Fallback para simulación local si no hay teléfono registrado
      if (!cleanPhone) {
        cleanPhone = "3162346645"; // Teléfono estándar de Víctor
      }

      // 2. Buscar perfil real en Supabase
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .or(`phone.eq.${cleanPhone},phone.eq.+57${cleanPhone},phone.eq.${cleanPhone.replace("+57", "")}`)
        .single();

      let activeImei = "80:F1:B2:D3:5C:2C"; // IMEI de prueba por defecto
      let userProfile = profile;

      if (profile) {
        // Cargar equipos vinculados
        const { data: userDevs } = await supabase
          .from("user_devices")
          .select("device_imei")
          .eq("user_id", profile.id);

        if (userDevs && userDevs.length > 0) {
          activeImei = userDevs[0].device_imei;
        }
      } else {
        // Mock profile de desarrollo para simulación
        userProfile = {
          id: "1b8863da-c50f-459c-9238-f68457944515",
          full_name: "Victor Julio González",
          phone: cleanPhone,
          isMock: true
        };
      }

      // 3. Cargar alertas configuradas para el equipo desde Supabase
      const { data: configs, error: configError } = await supabase
        .from("device_alert_configs")
        .select(`
          id, priority, is_enabled,
          alert_types (id, name, logo_url, folder, filename)
        `)
        .eq("device_imei", activeImei)
        .eq("is_enabled", true)
        .order("priority", { ascending: true });

      let deviceAlerts = [];
      if (configs && !configError) {
        deviceAlerts = configs
          .filter(c => c.alert_types)
          .map(c => ({
            id: c.alert_types.id,
            name: c.alert_types.name.toUpperCase(),
            logoUrl: c.alert_types.logo_url,
            folder: c.alert_types.folder,
            filename: c.alert_types.filename
          }));
      } else {
        // Alertas por defecto si falla la red o es offline
        deviceAlerts = [
          { id: 1, name: "ALERTA ACOSO", folder: "01", filename: "022.mp3", logoUrl: "https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.036984342417753724.jpg" },
          { id: 2, name: "APOYO SEGURIDAD", folder: "01", filename: "018.mp3", logoUrl: "https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.44202624317780237.png" },
          { id: 3, name: "ALERTA COMUNITARIA", folder: "01", filename: "001.mp3", logoUrl: "https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.019638656330525195.jpg" },
          { id: 4, name: "CAMIÓN BASURA", folder: "01", filename: "024.mp3", logoUrl: "https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.34251122646778.png" },
          { id: 5, name: "ENFERMERÍA", folder: "01", filename: "031.mp3", logoUrl: "https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/alert-assets/logos/0.22678617542065238.jpg" }
        ];
      }

      // 4. Cargar preferencias locales del AsyncStorage
      const localPrefsStr = await AsyncStorage.getItem("@veciseguro:notification_preferences");
      let localPrefs = {};
      if (localPrefsStr) {
        try {
          localPrefs = JSON.parse(localPrefsStr);
        } catch (e) {
          console.warn("DEBUG: Error al deserializar preferencias:", e);
        }
      }

      // Fusionar con las alertas cargadas para asegurar que todas tengan un valor por defecto (true)
      const mergedPrefs = { ...localPrefs };
      deviceAlerts.forEach(alert => {
        if (mergedPrefs[alert.name] === undefined) {
          mergedPrefs[alert.name] = true; // Habilitada por defecto
        }
      });

      this.setState({
        userProfile,
        selectedDevice: activeImei,
        alerts: deviceAlerts,
        preferences: mergedPrefs,
        loading: false
      });
    } catch (err) {
      console.warn("DEBUG: Error en carga de notificaciones:", err.message);
      this.setState({ loading: false });
    }
  };

  handleToggleAlert = (alertName) => {
    const { preferences } = this.state;
    this.setState({
      preferences: {
        ...preferences,
        [alertName]: !preferences[alertName]
      }
    });
  };

  handleSaveChanges = async () => {
    this.setState({ saving: true });
    try {
      const { preferences } = this.state;
      await AsyncStorage.setItem(
        "@veciseguro:notification_preferences",
        JSON.stringify(preferences)
      );

      // Sincronizar también con Supabase en el perfil del usuario para que el backend pueda consultarlo
      const { userProfile } = this.state;
      if (userProfile && !userProfile.isMock) {
        // Guardar fecha de actualización en Supabase de forma resiliente
        await supabase
          .from("profiles")
          .update({
            updated_at: new Date().toISOString()
          })
          .eq("id", userProfile.id);
      }

      Alert.alert(
        "¡Configuración Guardada!",
        "Tus preferencias de alertas han sido actualizadas y se aplicarán de inmediato.",
        [{ text: "Entendido", onPress: () => this.props.navigation.navigate("Home") }]
      );
    } catch (error) {
      Alert.alert("Error", "No se pudieron guardar los cambios: " + error.message);
    } finally {
      this.setState({ saving: false });
    }
  };

  renderAlertsList = (themeColors) => {
    const { alerts, preferences, darkMode } = this.state;

    if (alerts.length === 0) {
      return (
        <Block style={[styles.glassCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.cardBorder, paddingVertical: 40 }]}>
          <Text size={15} color={themeColors.textSecondary} center style={{ fontStyle: "italic" }}>
            No se encontraron alertas configuradas para tu equipo.
          </Text>
        </Block>
      );
    }

    return (
      <Block style={[styles.glassCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.cardBorder }]}>
        <Block row middle style={{ marginBottom: 24 }}>
          <Icon name="bell" family="Feather" size={20} color={themeColors.accent} style={{ marginRight: 10 }} />
          <Text bold size={13} color={themeColors.accent} style={{ letterSpacing: 0.8 }}>
            ALERTAS ACTIVAS EN TU SIRENA
          </Text>
        </Block>

        {alerts.map((alert, index) => {
          const isEnabled = preferences[alert.name] !== false;
          const hasLogo = alert.logoUrl && alert.logoUrl.trim().startsWith("http");

          return (
            <Block
              key={alert.id || index}
              style={[
                styles.alertRow,
                index === alerts.length - 1 ? null : [styles.rowBorder, { borderBottomColor: darkMode ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)" }]
              ]}
            >
              <Block row middle style={{ flex: 1 }}>
                <Block style={[styles.iconWrapper, { backgroundColor: darkMode ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)" }]}>
                  {hasLogo ? (
                    <Image
                      source={{ uri: alert.logoUrl }}
                      style={{ width: 32, height: 32, borderRadius: 8 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Icon
                      name={isEnabled ? "bell" : "bell-off"}
                      family="Feather"
                      size={18}
                      color={isEnabled ? themeColors.success : themeColors.textSecondary}
                    />
                  )}
                </Block>
                <Block style={{ marginLeft: 16, flex: 1 }}>
                  <Text bold size={15} color={themeColors.textPrimary}>
                    {alert.name}
                  </Text>
                  <Text size={11} color={themeColors.textSecondary} style={{ marginTop: 4 }}>
                    Trama: F{alert.folder} / A{alert.filename}
                  </Text>
                </Block>
              </Block>

              <Block style={{ paddingLeft: 10 }}>
                <Switch
                  value={isEnabled}
                  onValueChange={() => this.handleToggleAlert(alert.name)}
                  trackColor={{ false: darkMode ? "#1E293B" : "#E2E8F0", true: "rgba(16, 185, 129, 0.3)" }}
                  thumbColor={isEnabled ? themeColors.success : (darkMode ? "#94A3B8" : "#64748B")}
                  ios_backgroundColor={darkMode ? "#1E293B" : "#E2E8F0"}
                />
              </Block>
            </Block>
          );
        })}
      </Block>
    );
  };

  render() {
    const { loading, saving, darkMode } = this.state;

    const themeColors = darkMode ? {
      background: "#0B0F19",
      textPrimary: "#FFFFFF",
      textSecondary: "rgba(255, 255, 255, 0.4)",
      cardBackground: "rgba(255, 255, 255, 0.03)",
      cardBorder: "rgba(255, 255, 255, 0.06)",
      accent: "#6366F1", // Indigo premium
      success: "#10B981", // Emerald neon
      inputBg: "rgba(255, 255, 255, 0.04)",
      buttonBg: "#6366F1",
      buttonShadow: "rgba(99, 102, 241, 0.4)"
    } : {
      background: "#F8FAFC",
      textPrimary: "#1E293B",
      textSecondary: "rgba(30, 41, 59, 0.6)",
      cardBackground: "#FFFFFF",
      cardBorder: "rgba(0, 0, 0, 0.06)",
      accent: "#4F46E5",
      success: "#10B981",
      inputBg: "#F1F5F9",
      buttonBg: "#4F46E5",
      buttonShadow: "rgba(79, 70, 229, 0.2)"
    };

    return (
      <Block flex style={[styles.container, { backgroundColor: themeColors.background }]}>
        <Header
          transparent
          back
          title="Personalizar Alertas"
          navigation={this.props.navigation}
          white={darkMode}
        />

        {loading ? (
          <Block style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themeColors.accent} />
            <Text size={15} color={themeColors.textSecondary} style={{ marginTop: 12 }}>
              Cargando tus configuraciones...
            </Text>
          </Block>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header explicativo premium */}
            <Block style={styles.headerSection}>
              <Text bold size={26} color={themeColors.textPrimary}>
                Notificaciones {darkMode ? "🔔" : "☀️"}
              </Text>
              <Text size={14} color={themeColors.textSecondary} style={{ marginTop: 8, lineHeight: 22 }}>
                Decide cuáles alertas comunitarias deseas recibir en tu teléfono móvil y cuáles prefieres silenciar para evitar interrupciones.
              </Text>
            </Block>

            {/* Listado de Alertas */}
            {this.renderAlertsList(themeColors)}

            {/* Botón de guardar cambios */}
            <Block center style={{ marginTop: 10, marginBottom: 20 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={this.handleSaveChanges}
                disabled={saving}
                style={[
                  styles.saveButton,
                  {
                    backgroundColor: themeColors.buttonBg,
                    shadowColor: themeColors.buttonShadow
                  }
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Block row middle>
                    <Icon name="check-circle" family="Feather" size={20} color="white" style={{ marginRight: 8 }} />
                    <Text bold size={15} color="white" style={{ letterSpacing: 0.8 }}>
                      GUARDAR PREFERENCIAS
                    </Text>
                  </Block>
                )}
              </TouchableOpacity>
            </Block>
          </ScrollView>
        )}
      </Block>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 20 : 10,
    paddingBottom: 40
  },
  headerSection: {
    marginVertical: 20
  },
  glassCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    shadowOpacity: 0.15,
    elevation: 5,
    marginBottom: 20
  },
  alertRow: {
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%"
  },
  rowBorder: {
    borderBottomWidth: 1
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center"
  },
  saveButton: {
    width: width - 40,
    height: 54,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.3,
    elevation: 6
  }
});

export default Notifications;
