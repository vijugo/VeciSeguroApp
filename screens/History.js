import React from "react";
import {
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  View
} from "react-native";
import { Block, theme, Text } from "galio-framework";
import { Icon } from "../components";
import { argonTheme } from "../constants";
import { supabase } from "../constants/Supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("screen");

class History extends React.Component {
  state = {
    loading: true,
    logs: [],
    userProfile: null
  };

  async componentDidMount() {
    this._unsubscribeFocus = this.props.navigation.addListener('focus', () => {
      this.fetchHistory();
    });
    this.fetchHistory();
  }

  componentWillUnmount() {
    if (this._unsubscribeFocus) {
      this._unsubscribeFocus();
    }
  }

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
            const hasChat = log.metadata?.requires_chat;
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

  renderLog = (log) => {
    const isResolved = log.metadata?.status === 'resolved';
    const date = new Date(log.created_at);
    const requiresChat = log.metadata?.requires_chat !== false;
    
    return (
      <TouchableOpacity 
        key={log.id} 
        style={[styles.card, !requiresChat && { opacity: 0.85, backgroundColor: '#F8FAFC' }]}
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
              <Text size={16} bold color={!requiresChat ? argonTheme.COLORS.MUTED : argonTheme.COLORS.TEXT}>{log.alert_name}</Text>
              <Text size={12} color={argonTheme.COLORS.MUTED} style={{ marginTop: 2 }}>
                {date.toLocaleDateString()} • {date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </Text>
              {requiresChat ? (
                <Text size={12} bold color={argonTheme.COLORS.INFO} style={{ marginTop: 5 }}>
                  Ver Evidencia / Chat
                </Text>
              ) : (
                <Text size={12} italic color={argonTheme.COLORS.MUTED} style={{ marginTop: 5 }}>
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
    const { loading, logs } = this.state;
    return (
      <Block flex center style={styles.home}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.articles}
        >
          <Block flex>
            <Text bold size={18} style={styles.title}>
              Historial de Incidentes
            </Text>
            <Text size={14} color={argonTheme.COLORS.MUTED} style={{ marginBottom: 20 }}>
              Revisa la evidencia de los últimos eventos de tu cuadra.
            </Text>
            
            {loading ? (
              <ActivityIndicator size="large" color={argonTheme.COLORS.PRIMARY} style={{ marginTop: 50 }} />
            ) : logs.length === 0 ? (
              <Block center style={{ marginTop: 50 }}>
                <Icon name="inbox" family="Feather" size={50} color={argonTheme.COLORS.MUTED} />
                <Text size={16} color={argonTheme.COLORS.MUTED} style={{ marginTop: 10 }}>No hay historial disponible</Text>
              </Block>
            ) : (
              logs.map(log => this.renderLog(log))
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
    backgroundColor: theme.COLORS.WHITE
  },
  articles: {
    width: width - theme.SIZES.BASE * 2,
    paddingVertical: theme.SIZES.BASE,
  },
  title: {
    paddingBottom: 5,
  },
  card: {
    backgroundColor: theme.COLORS.WHITE,
    marginVertical: theme.SIZES.BASE / 2,
    borderWidth: 1,
    borderColor: '#E9ECEF',
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
