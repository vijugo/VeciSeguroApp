import React from "react";
import {
  StyleSheet,
  Dimensions,
  ScrollView,
  Platform,
  Linking,
  TouchableOpacity,
  Image,
  View
} from "react-native";
import { Block, Text, theme } from "galio-framework";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Header, Icon } from "../components";
import { argonTheme, Images } from "../constants";

const { width, height } = Dimensions.get("screen");

class About extends React.Component {
  _isMounted = true;

  componentWillUnmount() {
    this._isMounted = false;
  }

  setState(state, callback) {
    if (this._isMounted) {
      super.setState(state, callback);
    }
  }

  state = {
    darkMode: true
  };

  async componentDidMount() {
    // Cargar preferencia de tema de AsyncStorage
    try {
      const savedMode = await AsyncStorage.getItem("@veciseguro:dark_mode");
      if (savedMode !== null) {
        this.setState({ darkMode: JSON.parse(savedMode) });
      }
    } catch (e) {
      console.log("DEBUG: Error al cargar tema en Acerca de:", e.message);
    }
  }

  handleOpenWeb = () => {
    Linking.openURL("https://veci-seguro-web.vercel.app").catch(err => {
      console.error("DEBUG: Error abriendo URL:", err);
      alert("No se pudo abrir la página web");
    });
  };

  render() {
    const { darkMode } = this.state;

    const themeColors = darkMode ? {
      background: "#0B0F19",
      textPrimary: "#FFFFFF",
      textSecondary: "rgba(255, 255, 255, 0.4)",
      cardBackground: "rgba(255, 255, 255, 0.03)",
      cardBorder: "rgba(255, 255, 255, 0.06)",
      accent: "#6366F1",
      buttonBg: "#4F46E5",
      buttonShadow: "rgba(79, 70, 229, 0.4)",
      textMuted: "#94A3B8"
    } : {
      background: "#F8FAFC",
      textPrimary: "#1E293B",
      textSecondary: "rgba(30, 41, 59, 0.6)",
      cardBackground: "#FFFFFF",
      cardBorder: "rgba(0, 0, 0, 0.06)",
      accent: "#4F46E5",
      buttonBg: "#4F46E5",
      buttonShadow: "rgba(79, 70, 229, 0.2)",
      textMuted: "#64748B"
    };

    const specs = [
      {
        icon: "bell",
        title: "Botón de Emergencia Instantáneo",
        desc: "Al mantener presionado el botón de SOS, la sirena física de tu cuadra sonará fuerte, alertando de inmediato a tus vecinos."
      },
      {
        icon: "map-pin",
        title: "Ubicación Vecinal Exacta",
        desc: "Tus vecinos recibirán tu ubicación en tiempo real para saber de forma precisa de dónde proviene la alerta y acudir a ayudarte."
      },
      {
        icon: "sliders",
        title: "Alertas a tu Medida",
        desc: "Tú decides qué avisos deseas recibir en tu celular (como el camión de la basura, acoso o emergencias médicas) para evitar molestias."
      },
      {
        icon: "users",
        title: "Unión y Convivencia",
        desc: "Fortalece la seguridad de tu comunidad promoviendo la solidaridad, la comunicación y el apoyo mutuo entre todos los vecinos."
      },
      {
        icon: "globe",
        title: "Mapa del Barrio en Vivo",
        desc: "Puedes ver la ubicación de las sirenas del barrio y revisar el historial de alertas activadas desde la página oficial."
      }
    ];

    return (
      <Block flex style={[styles.container, { backgroundColor: themeColors.background }]}>
        <Header
          transparent
          back
          title="Acerca de"
          navigation={this.props.navigation}
          white={darkMode}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Logo y Encabezado del Sistema */}
          <Block center style={styles.headerSection}>
            <Image
              source={Images.Logo}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text bold size={24} color={themeColors.textPrimary} style={{ marginTop: 15 }}>
              VeciSeguro App
            </Text>
            <Text size={13} color={themeColors.accent} style={styles.versionBadge}>
              Protegiendo Nuestro Barrio
            </Text>
            <Text size={12} color={themeColors.textMuted} style={{ marginTop: 6, fontWeight: 'bold' }}>
              Versión: 1.1.0-Burst (Detección de Ráfagas BLE)
            </Text>
            <Text size={14} color={themeColors.textSecondary} style={styles.headerDescription}>
              La herramienta digital creada para cuidarnos, comunicarnos y proteger juntos a nuestra comunidad. ¡La seguridad la hacemos entre todos!
            </Text>
          </Block>

          {/* Tarjeta de Especificaciones */}
          <Block style={[styles.glassCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.cardBorder }]}>
            <Block row middle style={{ marginBottom: 20 }}>
              <Icon name="heart" family="Feather" size={18} color={themeColors.accent} style={{ marginRight: 8 }} />
              <Text bold size={13} color={themeColors.accent} style={{ letterSpacing: 0.8 }}>
                ¿CÓMO NOS CUIDA VECISEGURO?
              </Text>
            </Block>

            {specs.map((spec, index) => (
              <Block
                key={index}
                row
                style={[
                  styles.specRow,
                  index === specs.length - 1 ? null : [styles.rowBorder, { borderBottomColor: darkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)" }]
                ]}
              >
                <Block style={[styles.iconWrapper, { backgroundColor: darkMode ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)" }]}>
                  <Icon name={spec.icon} family="Feather" size={16} color={themeColors.accent} />
                </Block>
                <Block style={{ marginLeft: 14, flex: 1 }}>
                  <Text bold size={14} color={themeColors.textPrimary}>
                    {spec.title}
                  </Text>
                  <Text size={12} color={themeColors.textMuted} style={{ marginTop: 4, lineHeight: 18 }}>
                    {spec.desc}
                  </Text>
                </Block>
              </Block>
            ))}
          </Block>

          {/* Botón para Abrir Plataforma Web */}
          <Block center style={{ marginTop: 10, marginBottom: 20 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={this.handleOpenWeb}
              style={[
                styles.webButton,
                {
                  backgroundColor: themeColors.buttonBg,
                  shadowColor: themeColors.buttonShadow
                }
              ]}
            >
              <Block row middle>
                <Icon name="globe" family="Feather" size={18} color="white" style={{ marginRight: 8 }} />
                <Text bold size={14} color="white" style={{ letterSpacing: 0.8 }}>
                  VER MAPA DEL BARRIO
                </Text>
              </Block>
            </TouchableOpacity>

            <Text size={11} color={themeColors.textSecondary} style={styles.webButtonSubText}>
              Consulta el mapa de sirenas y registros del barrio en:
            </Text>
            <Text bold size={12} color={themeColors.accent} onPress={this.handleOpenWeb}>
              veci-seguro-web.vercel.app
            </Text>
          </Block>
        </ScrollView>
      </Block>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 20 : 10,
    paddingBottom: 40
  },
  headerSection: {
    alignItems: "center",
    marginVertical: 20
  },
  logoImage: {
    width: 90,
    height: 90
  },
  versionBadge: {
    marginTop: 6,
    letterSpacing: 1.2,
    fontWeight: "600",
    textTransform: "uppercase"
  },
  headerDescription: {
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 15,
    lineHeight: 20
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
  specRow: {
    flexDirection: "row",
    paddingVertical: 14
  },
  rowBorder: {
    borderBottomWidth: 1
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center"
  },
  webButton: {
    width: width - 40,
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.3,
    elevation: 6
  },
  webButtonSubText: {
    marginTop: 12,
    marginBottom: 4,
    opacity: 0.7
  }
});

export default About;
