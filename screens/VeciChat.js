import React from "react";
import {
  StyleSheet,
  Dimensions,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  FlatList,
  Alert,
  Image
} from "react-native";
import { Block, Text, theme } from "galio-framework";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { Buffer } from "buffer";

import { Header, Icon } from "../components";
import { argonTheme } from "../constants";
import { supabase } from "../constants/Supabase";

const { width } = Dimensions.get("screen");

class VeciChat extends React.Component {
  state = {
    loading: true,
    chatRoom: null,
    messages: [],
    inputText: "",
    sending: false,
    uploadingImage: false,
    userProfile: null,
    darkMode: true,
    alertLog: null
  };

  async componentDidMount() {
    const { route } = this.props;
    const alertLog = route.params?.alertLog;

    if (!alertLog) {
      Alert.alert("Error", "No se especificó ninguna alerta activa para el chat.", [
        { text: "Regresar", onPress: () => this.props.navigation.goBack() }
      ]);
      return;
    }

    this.setState({ alertLog });

    // 0. Cargar preferencia de tema de AsyncStorage
    try {
      const savedMode = await AsyncStorage.getItem("@veciseguro:dark_mode");
      if (savedMode !== null) {
        this.setState({ darkMode: JSON.parse(savedMode) });
      }
    } catch (e) {
      console.log("DEBUG: Error al cargar tema en VeciChat:", e.message);
    }

    // 1. Obtener perfil de usuario actual
    await this.loadUserProfile();

    // 2. Obtener o crear sala de chat vinculada al alertLog.id
    await this.getOrCreateChatRoom(alertLog.id);
  }

  componentWillUnmount() {
    // Limpiar suscripción en tiempo real al salir de la pantalla
    if (this.messagesSubscription) {
      supabase.removeChannel(this.messagesSubscription);
    }
  }

  loadUserProfile = async () => {
    try {
      const savedPhone = await AsyncStorage.getItem("@veciseguro:saved_phone");
      let cleanPhone = savedPhone ? savedPhone.trim() : "";

      if (!cleanPhone) {
        cleanPhone = "3162346645"; // Víctor por defecto en simulación
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .or(`phone.eq.${cleanPhone},phone.eq.+57${cleanPhone},phone.eq.${cleanPhone.replace("+57", "")}`)
        .single();

      if (profile) {
        this.setState({ userProfile: profile });
      } else {
        // Mock profile en caso offline/desarrollo
        this.setState({
          userProfile: {
            id: "1b8863da-c50f-459c-9238-f68457944515",
            full_name: "Victor Julio González",
            phone: cleanPhone,
            isMock: true
          }
        });
      }
    } catch (err) {
      console.warn("DEBUG: Error cargando perfil en VeciChat:", err.message);
    }
  };

  getOrCreateChatRoom = async (alertLogId) => {
    try {
      // Intentar buscar la sala existente
      const { data: existing, error } = await supabase
        .from("alert_chats")
        .select("*")
        .eq("alert_log_id", alertLogId)
        .maybeSingle();

      if (existing) {
        console.log("DEBUG: Sala de chat encontrada:", existing.id);
        this.setState({ chatRoom: existing }, () => {
          this.loadMessages(existing.id);
          this.subscribeToMessages(existing.id);
        });
      } else {
        console.log("DEBUG: Sala no existe. Creando nueva sala para alerta:", alertLogId);
        // Crear nueva sala
        const { data: created, error: createError } = await supabase
          .from("alert_chats")
          .insert({ alert_log_id: alertLogId, status: "active" })
          .select()
          .single();

        if (createError) throw createError;

        this.setState({ chatRoom: created }, () => {
          this.loadMessages(created.id);
          this.subscribeToMessages(created.id);
        });
      }
    } catch (err) {
      console.warn("DEBUG: Error al obtener/crear sala de chat:", err.message);
      // Fallback local en caso de error de red
      const mockChat = { id: "mock-chat-id", alert_log_id: alertLogId, status: "active" };
      this.setState({
        chatRoom: mockChat,
        messages: [
          {
            id: "msg-welcome",
            chat_id: "mock-chat-id",
            sender_id: "system",
            content: "¡Canal de emergencia activo! Todos los vecinos están conectados para coordinar el apoyo.",
            type: "text",
            created_at: new Date().toISOString(),
            sender_name: "Sistema"
          }
        ],
        loading: false
      });
    }
  };

  loadMessages = async (chatId) => {
    try {
      const { data: msgs, error } = await supabase
        .from("chat_messages")
        .select(`
          id, chat_id, sender_id, type, content, created_at,
          profiles (full_name, phone)
        `)
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const formatted = msgs.map(m => ({
        id: m.id,
        chat_id: m.chat_id,
        sender_id: m.sender_id,
        type: m.type,
        content: m.content,
        created_at: m.created_at,
        sender_name: m.profiles ? m.profiles.full_name : "Vecino"
      }));

      this.setState({ messages: formatted, loading: false });
    } catch (err) {
      console.warn("DEBUG: Error al cargar mensajes:", err.message);
      this.setState({ loading: false });
    }
  };

  subscribeToMessages = (chatId) => {
    console.log("DEBUG: 📡 Suscribiéndose a mensajes del chat:", chatId);

    this.messagesSubscription = supabase
      .channel(`chat-messages-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `chat_id=eq.${chatId}`
        },
        async (payload) => {
          const newMsg = payload.new;
          console.log("DEBUG: Nuevo mensaje recibido en tiempo real:", newMsg);

          // Obtener nombre del remitente de forma resiliente
          let senderName = "Vecino";
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", newMsg.sender_id)
              .single();
            if (profile) senderName = profile.full_name;
          } catch (e) {}

          const formatted = {
            id: newMsg.id,
            chat_id: newMsg.chat_id,
            sender_id: newMsg.sender_id,
            type: newMsg.type,
            content: newMsg.content,
            created_at: newMsg.created_at,
            sender_name: senderName
          };

          this.setState(prev => ({
            messages: [...prev.messages, formatted]
          }));
        }
      )
      .subscribe();
  };

  sendMessage = async (textToSend) => {
    const text = textToSend || this.state.inputText;
    if (!text || text.trim() === "") return;

    this.setState({ sending: true, inputText: "" });

    try {
      const { chatRoom, userProfile } = this.state;
      if (userProfile.isMock) {
        // En simulación local offline, agregamos directo al state
        const localMsg = {
          id: Date.now().toString(),
          chat_id: chatRoom.id,
          sender_id: userProfile.id,
          type: "text",
          content: text.trim(),
          created_at: new Date().toISOString(),
          sender_name: userProfile.full_name
        };
        this.setState(prev => ({
          messages: [...prev.messages, localMsg],
          sending: false
        }));
        return;
      }

      const { error } = await supabase
        .from("chat_messages")
        .insert({
          chat_id: chatRoom.id,
          sender_id: userProfile.id,
          type: "text",
          content: text.trim()
        });

      if (error) throw error;
      
      this.notifyNeighbors(text.trim());
      
      this.setState({ sending: false });
    } catch (err) {
      console.warn("DEBUG: Error al enviar mensaje:", err.message);
      this.setState({ sending: false });
    }
  };

  notifyNeighbors = async (messageText) => {
    try {
      const imei = this.state.alertLog?.imei;
      if (!imei) return;

      const { data: users, error } = await supabase
        .from('user_devices')
        .select('user_id')
        .eq('device_imei', imei);
        
      if (error || !users) return;
      
      const userIds = users.map(u => u.user_id).filter(id => id !== this.state.userProfile.id);
      if (userIds.length === 0) return;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('push_token')
        .in('id', userIds)
        .not('push_token', 'is', null);

      if (!profiles || profiles.length === 0) return;

      const tokens = profiles.map(p => p.push_token);
      
      const messages = tokens.map(token => ({
        to: token,
        sound: 'default',
        title: `🚨 VeciChat: ${this.state.alertLog.alert_name}`,
        body: `${this.state.userProfile.full_name}: ${messageText}`,
      }));

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
    } catch (e) {
      console.log("DEBUG: Error enviando push a vecinos:", e);
    }
  };

  pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permiso Denegado", "Se necesita permiso para acceder a la galería y poder enviar fotos.");
        return;
      }

      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        this.setState({ uploadingImage: true });
        const asset = result.assets[0];
        
        // Convertir base64 a Buffer para subir a Supabase Storage
        const base64Data = asset.base64;
        const buffer = Buffer.from(base64Data, "base64");
        
        const fileExt = asset.uri.split('.').pop() || "jpg";
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${this.state.chatRoom.id}/${fileName}`;

        // Subir al bucket "chat-images"
        const { data, error } = await supabase.storage
          .from("chat-images")
          .upload(filePath, buffer, {
            contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`
          });

        if (error) throw error;

        const { data: publicUrlData } = supabase.storage
          .from("chat-images")
          .getPublicUrl(filePath);
          
        const imageUrl = publicUrlData.publicUrl;

        // Guardar el mensaje en chat_messages con type="image"
        const { error: msgError } = await supabase
          .from("chat_messages")
          .insert({
            chat_id: this.state.chatRoom.id,
            sender_id: this.state.userProfile.id,
            type: "image",
            content: imageUrl
          });

        if (msgError) throw msgError;

        this.notifyNeighbors("📷 Ha enviado una foto");

        this.setState({ uploadingImage: false });
      }
    } catch (err) {
      console.warn("DEBUG: Error subiendo imagen:", err.message);
      this.setState({ uploadingImage: false });
      Alert.alert("Error", "Hubo un problema al subir o enviar la foto.");
    }
  };

  handleMarkUnderControl = async () => {
    Alert.alert(
      "¿Marcar Bajo Control?",
      "Esto indicará a todos los vecinos que la emergencia ha sido atendida y finalizará el chat activo.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, Todo Bajo Control",
          onPress: async () => {
            try {
              const { alertLog, chatRoom } = this.state;
              
              // 1. Marcar chat como resuelto en alert_chats
              await supabase
                .from("alert_chats")
                .update({ status: "resolved", resolved_at: new Date().toISOString() })
                .eq("id", chatRoom.id);

              // 2. Marcar estado de la alerta como resuelta en alert_logs metadata
              const updatedMetadata = { ...alertLog.metadata, status: "resolved" };
              await supabase
                .from("alert_logs")
                .update({ metadata: updatedMetadata })
                .eq("id", alertLog.id);

              // Enviar mensaje de sistema en el chat
              await supabase
                .from("chat_messages")
                .insert({
                  chat_id: chatRoom.id,
                  sender_id: this.state.userProfile.id,
                  type: "text",
                  content: "📢 INCIDENTE RESUELTO: El vecino ha marcado el evento como BAJO CONTROL. Gracias a todos por su apoyo."
                });

              this.setState(prev => ({
                chatRoom: { ...prev.chatRoom, status: "resolved" }
              }));
            } catch (err) {
              console.warn("DEBUG: Error al resolver emergencia:", err.message);
            }
          }
        }
      ]
    );
  };

  renderMessageItem = ({ item }) => {
    const { userProfile, darkMode } = this.state;
    const isMe = item.sender_id === userProfile?.id;
    const isSystem = item.sender_id === "system" || item.content.startsWith("📢");

    if (isSystem) {
      return (
        <Block center style={styles.systemMessageContainer}>
          <Text size={11} color={darkMode ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)"} style={styles.systemMessageText}>
            {item.content}
          </Text>
        </Block>
      );
    }

    const bubbleBg = isMe
      ? "#6366F1" // Azul indigo brillante para mí
      : (darkMode ? "rgba(255,255,255,0.06)" : "#FFFFFF"); // Gris/blanco para vecinos

    const bubbleBorder = isMe
      ? "transparent"
      : (darkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)");

    const textStyle = {
      color: isMe ? "#FFFFFF" : (darkMode ? "#FFFFFF" : "#1E293B"),
      fontSize: 14
    };

    const senderStyle = {
      color: isMe ? "rgba(255, 255, 255, 0.7)" : (darkMode ? "#818CF8" : "#4F46E5"),
      fontSize: 11,
      fontWeight: "bold",
      marginBottom: 3
    };

    return (
      <Block style={[styles.messageRow, isMe ? styles.myRow : styles.neighborRow]}>
        <Block style={[
          styles.messageBubble,
          {
            backgroundColor: bubbleBg,
            borderColor: bubbleBorder,
            borderWidth: isMe ? 0 : 1
          }
        ]}>
          <Text style={senderStyle}>{item.sender_name}</Text>
          {item.type === 'image' ? (
            <Image 
              source={{ uri: item.content }} 
              style={{ width: 220, height: 220, borderRadius: 12, marginVertical: 6 }} 
              resizeMode="cover"
            />
          ) : (
            <Text style={textStyle}>{item.content}</Text>
          )}
          <Text style={[styles.timeText, { color: isMe ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)" }]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </Block>
      </Block>
    );
  };

  render() {
    const { loading, messages, inputText, sending, chatRoom, alertLog, darkMode } = this.state;

    const themeColors = darkMode ? {
      background: "#0B0F19",
      textPrimary: "#FFFFFF",
      textSecondary: "rgba(255, 255, 255, 0.4)",
      cardBackground: "rgba(255, 255, 255, 0.03)",
      cardBorder: "rgba(255, 255, 255, 0.06)",
      accent: "#6366F1",
      accentLight: "rgba(99, 102, 241, 0.1)",
      danger: "#EF4444",
      dangerLight: "rgba(239, 68, 68, 0.1)",
      inputBg: "rgba(255, 255, 255, 0.04)"
    } : {
      background: "#F8FAFC",
      textPrimary: "#1E293B",
      textSecondary: "rgba(30, 41, 59, 0.6)",
      cardBackground: "#FFFFFF",
      cardBorder: "rgba(0, 0, 0, 0.06)",
      accent: "#4F46E5",
      accentLight: "rgba(79, 70, 229, 0.08)",
      danger: "#DC2626",
      dangerLight: "rgba(220, 38, 38, 0.08)",
      inputBg: "#E2E8F0"
    };

    const isResolved = chatRoom?.status === "resolved" || alertLog?.metadata?.status === "resolved";

    const quickMessages = [
      "🚨 ¡Voy de salida a ayudar!",
      "📞 Ya reporté al 123",
      "👀 Atento desde mi ventana",
      "👍 Falsa alarma / Bajo control"
    ];

    return (
      <Block flex style={[styles.container, { backgroundColor: themeColors.background }]}>
        <Header
          transparent
          back
          title="Chat Vecinal de Pánico"
          navigation={this.props.navigation}
          white={darkMode}
        />

        {loading ? (
          <Block style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themeColors.accent} />
            <Text size={14} color={themeColors.textSecondary} style={{ marginTop: 12 }}>
              Conectando con la sala de emergencias...
            </Text>
          </Block>
        ) : (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            {/* Header del incidente activo */}
            <Block style={[styles.eventHeader, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.cardBorder }]}>
              <Block row middle space="between" style={{ width: "100%" }}>
                <Block style={{ flex: 1 }}>
                  <Block row middle style={{ alignSelf: "flex-start" }}>
                    <Block style={[styles.activeDot, { backgroundColor: isResolved ? "#94A3B8" : themeColors.danger }]} />
                    <Text bold size={13} color={isResolved ? themeColors.textSecondary : themeColors.danger}>
                      {isResolved ? "EMERGENCIA BAJO CONTROL" : "EMERGENCIA EN CURSO 🚨"}
                    </Text>
                  </Block>
                  <Text bold size={16} color={themeColors.textPrimary} style={{ marginTop: 4 }}>
                    {alertLog?.alert_name}
                  </Text>
                  <Text size={12} color={themeColors.textSecondary} style={{ marginTop: 2 }}>
                    Reportado por: {alertLog?.metadata?.user_name || "Un vecino"}
                  </Text>
                </Block>

                {/* Botón de Resolver */}
                {!isResolved && (
                  <TouchableOpacity
                    onPress={this.handleMarkUnderControl}
                    style={[styles.resolveButton, { backgroundColor: themeColors.dangerLight, borderColor: themeColors.danger }]}
                  >
                    <Text bold size={11} color={themeColors.danger}>MARCAR SANO</Text>
                  </TouchableOpacity>
                )}
              </Block>
            </Block>

            {/* Listado de mensajes en tiempo real */}
            <FlatList
              data={messages}
              keyExtractor={item => item.id}
              renderItem={this.renderMessageItem}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              ref={ref => (this.flatListRef = ref)}
              onContentSizeChange={() => this.flatListRef?.scrollToEnd({ animated: true })}
            />

            {/* Panel inferior de interacción */}
            {isResolved ? (
              <Block center style={[styles.resolvedBanner, { backgroundColor: themeColors.cardBackground }]}>
                <Icon name="check-circle" family="Feather" size={20} color={darkMode ? "#10B981" : "#059669"} style={{ marginBottom: 6 }} />
                <Text bold size={13} color={darkMode ? "#10B981" : "#059669"}>
                  ESTE INCIDENTE HA SIDO MARCADO BAJO CONTROL
                </Text>
                <Text size={11} color={themeColors.textSecondary} style={{ marginTop: 2 }}>
                  El chat se encuentra cerrado y archivado en el historial.
                </Text>
              </Block>
            ) : (
              <Block style={[styles.inputPanel, { backgroundColor: themeColors.cardBackground }]}>
                {/* Mensajes Rápidos para presionar con un toque */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickMessagesScroll}
                >
                  {quickMessages.map((text, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => this.sendMessage(text)}
                      style={[styles.quickMessageTag, { backgroundColor: darkMode ? "rgba(255,255,255,0.04)" : "#FFFFFF", borderColor: themeColors.cardBorder }]}
                    >
                      <Text size={12} color={themeColors.textPrimary}>{text}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Input de Texto principal */}
                <Block row middle style={styles.inputWrapper}>
                  <TouchableOpacity
                    onPress={this.pickImage}
                    disabled={this.state.uploadingImage}
                    style={styles.cameraButton}
                  >
                    {this.state.uploadingImage ? (
                      <ActivityIndicator color={themeColors.textSecondary} size="small" />
                    ) : (
                      <Icon name="camera" family="Feather" size={22} color={themeColors.textSecondary} />
                    )}
                  </TouchableOpacity>

                  <TextInput
                    value={inputText}
                    onChangeText={inputText => this.setState({ inputText })}
                    placeholder="Escribe un mensaje de apoyo..."
                    placeholderTextColor={darkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
                    style={[styles.textInput, { backgroundColor: themeColors.inputBg, color: themeColors.textPrimary }]}
                  />

                  <TouchableOpacity
                    onPress={() => this.sendMessage()}
                    disabled={sending}
                    style={[styles.sendButton, { backgroundColor: themeColors.accent }]}
                  >
                    {sending ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Icon name="send" family="Feather" size={16} color="white" />
                    )}
                  </TouchableOpacity>
                </Block>
              </Block>
            )}
          </KeyboardAvoidingView>
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
  eventHeader: {
    padding: 16,
    borderBottomWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    shadowOpacity: 0.05,
    elevation: 3
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  resolveButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  messagesList: {
    padding: 16,
    paddingBottom: 24
  },
  messageRow: {
    flexDirection: "row",
    marginVertical: 6,
    width: "100%"
  },
  myRow: {
    justifyContent: "flex-end"
  },
  neighborRow: {
    justifyContent: "flex-start"
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 0.05,
    elevation: 1
  },
  timeText: {
    fontSize: 9,
    alignSelf: "flex-end",
    marginTop: 4
  },
  systemMessageContainer: {
    marginVertical: 12,
    width: "100%",
    alignItems: "center"
  },
  systemMessageText: {
    textAlign: "center",
    fontStyle: "italic",
    paddingHorizontal: 20
  },
  resolvedBanner: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    alignItems: "center"
  },
  inputPanel: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)"
  },
  quickMessagesScroll: {
    paddingBottom: 10
  },
  quickMessageTag: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.02,
    elevation: 1
  },
  cameraButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center"
  },
  inputWrapper: {
    width: "100%",
    marginTop: 4
  },
  textInput: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 16,
    fontSize: 14
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10
  }
});

export default VeciChat;
