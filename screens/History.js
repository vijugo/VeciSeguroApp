import React from "react";
import {
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  View,
  Appearance
} from "react-native";
import { Block, theme, Text } from "galio-framework";
import { Icon, Header } from "../components";
import { argonTheme } from "../constants";
import { supabase } from "../constants/Supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("screen");

class History extends React.Component {
  state = {
    loading: true,
    logs: [],
    userProfile: null,
    darkMode: true
  };

  async componentDidMount() {
    this._unsubscribeFocus = this.props.navigation.addListener('focus', () => {
      this.fetchHistory();
      this.loadTheme();
    });
    this.fetchHistory();
    this.loadTheme();
  }

  componentWillUnmount() {
    if (this._unsubscribeFocus) {
      this._unsubscribeFocus();
    }
  }

  loadTheme = async () => {
    try {
      const savedMode = await AsyncStorage.getItem("@veciseguro:dark_mode");
      if (savedMode !== null) {
        this.setState({ darkMode: JSON.parse(savedMode) });
      } else {
        const systemMode = Appearance.getColorScheme();
        this.setState({ darkMode: systemMode === "dark" });
      }
    } catch (e) {
      console.log("Error loading dark mode in History", e);
    }
  };

  fetchHistory = async () => {
    this.setState({ loading: true });
    try {
      const phone = await AsyncStorage.getItem('user_phone');
      if (!phone) return;
      const cleanPhone = phone.trim();
      
      let profile;
      if (cleanPhone === '3162346645' || cleanPhone === '+573162346645') {
        profile = {
          id: '1b8863da-c50f-459c-9238-f68457944515',
          full_name: 'Victor Julio González',
        };
      } else {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .or(`phone.eq.${cleanPhone},phone.eq.+57${cleanPhone},phone.eq.${cleanPhone.replace('+57', '')}`)
          .single();
        profile = data;
      }
      
      this.setState({ userProfile: profile });

      if (profile) {
        // Obtener equipos del usuario
        const { data: userDevs } = await supabase
          .from('user_devices')
          .select('device_imei')
          .eq('user_id', profile.id);
          
        if (userDevs && userDevs.length > 0) {
          const imeis = userDevs.map(d => d.device_imei);
          // Obtener los últimos 50 eventos para luego filtrar
          const { data: logs } = await supabase
            .from('alert_logs')
            .select('*')
            .in('imei', imeis)
            .order('created_at', { ascending: false })
            .limit(50);
            
          // Filtramos para mostrar solo emergencias reales (para registros nuevos y antiguos)
          const criticalNames = ['PÁNICO', 'ROBO', 'INCENDIO', 'ACOSO', 'MÉDICA', 'URGENCIA', 'SOS', 'PANICO'];
          const emergencyLogs = (logs || []).filter(log => {
            const hasChat = log.metadata && log.metadata.requires_chat;
            if (hasChat === true) return true;
            if (hasChat === false) return false;
            // Fallback para alertas antiguas sin metadata.requires_chat
            const name = (log.alert_name || '').toUpperCase();
            return criticalNames.some(cn => name.includes(cn));
          });
          this.setState({ logs: emergencyLogs });
        }
      }
    } catch (e) {
      console.log("Error loading history", e);
    } finally {
      this.setState({ loading: false });
    }
  };

  openChatEvidence = async (log) => {
    // Buscar la sala de chat de esta alerta
    const { data: chat } = await supabase
      .from('alert_chats')
      .select('*')
      .eq('alert_log_id', log.id)
      .single();
      
    if (chat) {
      this.props.navigation.navigate("VeciChat", {
        chatRoom: chat,
        alertLog: log,
        userProfile: this.state.userProfile,
        isReadOnly: true
      });
    } else {
      alert("No hay evidencia ni chat para esta alerta.");
    }
  };

  renderLog = (log, themeColors) => {
    const isResolved = log.metadata && log.metadata.status === 'resolved';
    const date = new Date(log.created_at);
    const requiresChat = !log.metadata || log.metadata.requires_chat !== false;
    
    return (
      <TouchableOpacity 
        key={log.id} 
        style={[
          styles.card, 
          { 
            backgroundColor: themeColors.cardBackground, 
            borderColor: themeColors.cardBorder 
          },
          !requiresChat && { opacity: 0.85 }
        ]}
        disabled={!requiresChat}
        onPress={() => this.openChatEvidence(log)}
      >
        <Block row space="between" style={{ padding: theme.SIZES.BASE }}>
          <Block flex row>
            <Block style={[styles.iconContainer, { backgroundColor: !requiresChat ? argonTheme.COLORS.MUTED : (isResolved ? argonTheme.COLORS.SUCCESS : argonTheme.COLORS.ERROR) }]}>
              <Icon
                name={!requiresChat ? "info" : (isResolved ? "check" : "bell")}
                family="Feather"
                size={16}
                color="white"
              />
            </Block>
            <Block flex style={{ marginLeft: 15 }}>
              <Text size={16} bold color={!requiresChat ? argonTheme.COLORS.MUTED : themeColors.textPrimary}>{log.alert_name}</Text>
              <Text size={12} color={themeColors.textSecondary} style={{ marginTop: 2 }}>
                {date.toLocaleDateString()} • {date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </Text>
              {requiresChat ? (
                <Text size={12} bold color={themeColors.accent} style={{ marginTop: 5 }}>
                  Ver Evidencia / Chat
                </Text>
              ) : (
                <Text size={12} italic color={themeColors.textSecondary} style={{ marginTop: 5 }}>
                  Solo Aviso (Sin Chat)
                </Text>
              )}
            </Block>
          </Block>
          <Block center justify="center">
            {requiresChat ? (
              <Badge color={isResolved ? argonTheme.COLORS.SUCCESS : argonTheme.COLORS.ERROR} style={{ paddingHorizontal: 8 }}>
                <Text size={10} bold color="white">{isResolved ? "CONTROLADO" : "EN CURSO"}</Text>
              </Badge>
            ) : (
              <Badge color={argonTheme.COLORS.MUTED} style={{ paddingHorizontal: 8 }}>
                <Text size={10} bold color="white">AVISO</Text>
              </Badge>
            )}
          </Block>
        </Block>
      </TouchableOpacity>
    );
  };

  render() {
    const { loading, logs, darkMode } = this.state;

    const themeColors = darkMode ? {
      background: "#0B0F19",
      textPrimary: "#FFFFFF",
      textSecondary: "rgba(255, 255, 255, 0.4)",
      cardBackground: "rgba(255, 255, 255, 0.03)",
      cardBorder: "rgba(255, 255, 255, 0.08)",
      accent: "#6366F1"
    } : {
      background: "#F8FAFC",
      textPrimary: "#1E293B",
      textSecondary: "rgba(30, 41, 59, 0.6)",
      cardBackground: "#FFFFFF",
      cardBorder: "rgba(0, 0, 0, 0.06)",
      accent: "#4F46E5"
    };

    return (
      <Block flex style={[styles.home, { backgroundColor: themeColors.background }]}>
        <Header
          transparent
          back
          title="Historial"
          navigation={this.props.navigation}
          white={darkMode}
        />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.articles}
        >
          <Block flex>
            <Text bold size={18} color={themeColors.textPrimary} style={styles.title}>
              Historial de Incidentes
            </Text>
            <Text size={14} color={themeColors.textSecondary} style={{ marginBottom: 20 }}>
              Revisa la evidencia de los últimos eventos de tu cuadra.
            </Text>
            
            {loading ? (
              <ActivityIndicator size="large" color={themeColors.accent} style={{ marginTop: 50 }} />
            ) : logs.length === 0 ? (
              <Block center style={{ marginTop: 50 }}>
                <Icon name="inbox" family="Feather" size={50} color={themeColors.textSecondary} />
                <Text size={16} color={themeColors.textSecondary} style={{ marginTop: 10 }}>No hay historial disponible</Text>
              </Block>
            ) : (
              logs.map(log => this.renderLog(log, themeColors))
            )}
          </Block>
        </ScrollView>
      </Block>
    );
  }
}

const Badge = ({ children, color, style }) => (
  <Block style={[{ backgroundColor: color, borderRadius: 12, paddingVertical: 4 }, style]}>
    {children}
  </Block>
);

const styles = StyleSheet.create({
  home: {
    width: width,
  },
  articles: {
    width: width - theme.SIZES.BASE * 2,
    paddingVertical: theme.SIZES.BASE,
    alignSelf: "center"
  },
  title: {
    paddingBottom: 5,
  },
  card: {
    marginVertical: theme.SIZES.BASE / 2,
    borderWidth: 1,
    borderRadius: 8,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.1,
    elevation: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  }
});

export default History;
