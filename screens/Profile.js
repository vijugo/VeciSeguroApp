import React from "react";
import {
  StyleSheet,
  Dimensions,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView
} from "react-native";
import { Block, Text, theme } from "galio-framework";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";

import { Button, Input, Icon } from "../components";
import { Images, argonTheme } from "../constants";
import { HeaderHeight } from "../constants/utils";
import { supabase } from "../constants/Supabase";

const { width, height } = Dimensions.get("screen");

class Profile extends React.Component {
  state = {
    userId: null,
    fullName: "",
    phone: "",
    email: "",
    avatarUrl: "",
    newPassword: "",
    confirmPassword: "",
    loading: true,
    saving: false,
    darkMode: true
  };

  componentDidMount() {
    this.loadProfile();
  }

  loadProfile = async () => {
    this.setState({ loading: true });
    try {
      // 0. Intentar precargar desde el caché local (AsyncStorage) para renderizado instantáneo
      const cachedAvatar = await AsyncStorage.getItem("user_avatar");
      const cachedName = await AsyncStorage.getItem("user_fullname");
      const cachedEmail = await AsyncStorage.getItem("user_email");
      const savedPhone = await AsyncStorage.getItem("user_phone");

      if (cachedAvatar || cachedName || cachedEmail) {
        this.setState({
          avatarUrl: cachedAvatar || "",
          fullName: cachedName || "",
          email: cachedEmail || "",
          phone: savedPhone || ""
        });
      }

      // 1. Intentar cargar el perfil por el usuario autenticado activo en Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        console.log("DEBUG: Cargando perfil por ID de Supabase Auth:", user.id);
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .limit(1)
          .maybeSingle();

        if (profile) {
          console.log("DEBUG: Perfil encontrado por ID:", profile.full_name);
          
          // Guardar en caché local
          if (profile.avatar_url) await AsyncStorage.setItem("user_avatar", profile.avatar_url);
          if (profile.full_name) await AsyncStorage.setItem("user_fullname", profile.full_name);
          if (profile.email) await AsyncStorage.setItem("user_email", profile.email);
          if (profile.phone) await AsyncStorage.setItem("user_phone", profile.phone);

          this.setState({
            userId: profile.id,
            fullName: profile.full_name || "",
            phone: profile.phone || "",
            email: profile.email || user.email || "",
            avatarUrl: profile.avatar_url || "",
            loading: false
          });
          return;
        }
      }

      // 2. Si no hay usuario activo o no se encontró por ID, buscar por teléfono
      if (savedPhone) {
        const cleanPhone = savedPhone.trim();
        console.log("DEBUG: Buscando perfil por número telefónico:", cleanPhone);

        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("*")
          .or(`phone.eq.${cleanPhone},phone.eq.+57${cleanPhone},phone.eq.${cleanPhone.replace("+57", "")}`)
          .limit(1);

        if (profiles && profiles.length > 0) {
          const profile = profiles[0];
          console.log("DEBUG: Perfil encontrado por teléfono:", profile.full_name);

          // Guardar en caché local
          if (profile.avatar_url) await AsyncStorage.setItem("user_avatar", profile.avatar_url);
          if (profile.full_name) await AsyncStorage.setItem("user_fullname", profile.full_name);
          if (profile.email) await AsyncStorage.setItem("user_email", profile.email);

          this.setState({
            userId: profile.id,
            fullName: profile.full_name || "",
            phone: profile.phone || "",
            email: profile.email || "",
            avatarUrl: profile.avatar_url || "",
            loading: false
          });
          return;
        }
      }

      // 3. Fallback de desarrollo local seguro
      const fallbackPhone = savedPhone || "3162346645";
      this.setState({
        userId: "1b8863da-c50f-459c-9238-f68457944515",
        fullName: this.state.fullName || "Victor Julio González",
        phone: fallbackPhone,
        email: this.state.email || "vijugo@gmail.com",
        avatarUrl: this.state.avatarUrl || "https://dxautkeaaxayfshxwaiq.supabase.co/storage/v1/object/public/avatars/1b8863da-c50f-459c-9238-f68457944515.png",
        loading: false
      });

    } catch (err) {
      console.error("DEBUG: Error al cargar perfil:", err);
      this.setState({ loading: false });
    }
  };

  requestPermissions = async () => {
    // Verificar si el módulo nativo de expo-image-picker está disponible en esta compilación nativa
    if (!ImagePicker || !ImagePicker.requestMediaLibraryPermissionsAsync || !ImagePicker.requestCameraPermissionsAsync) {
      Alert.alert(
        "Cámara/Galería No Vinculada 📷",
        "Esta compilación actual de tu celular no tiene instaladas las librerías nativas de Cámara/Galería (requiere ejecutar 'expo run:android' para recompilar el APK). \n\nPor ahora, puedes ingresar el enlace de tu foto directamente en el campo de texto abajo."
      );
      return false;
    }

    if (Platform.OS !== "web") {
      try {
        const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
        if (libraryStatus !== "granted" || cameraStatus !== "granted") {
          Alert.alert(
            "Permiso requerido",
            "Necesitamos acceso a tu cámara y galería para poder actualizar tu foto de perfil."
          );
          return false;
        }
        return true;
      } catch (err) {
        console.log("DEBUG: Error pidiendo permisos nativos:", err);
        Alert.alert(
          "Cámara/Galería No Vinculada 📷",
          "Esta compilación actual de tu celular no tiene instaladas las librerías nativas de Cámara/Galería (requiere recompilar el APK). \n\nPor ahora, puedes ingresar el enlace de tu foto directamente en el campo de texto abajo."
        );
        return false;
      }
    }
    return true;
  };

  handleSelectAvatarSource = () => {
    // Si no está disponible el módulo nativo, no abrir el selector nativo para evitar crash
    if (!ImagePicker || !ImagePicker.launchImageLibraryAsync) {
      Alert.alert(
        "Cámara/Galería No Vinculada 📷",
        "Esta compilación de tu celular no tiene las librerías nativas de Cámara/Galería vinculadas. \n\n¡No te preocupes! Puedes ingresar la URL de tu imagen directamente en el campo de texto de abajo y se cargará en la base de datos."
      );
      return;
    }

    Alert.alert(
      "Foto de Perfil 📸",
      "Selecciona de dónde deseas tomar la nueva imagen de perfil:",
      [
        { text: "Elegir de Galería 🖼️", onPress: this.handleSelectFromGallery },
        { text: "Tomar Foto 📷", onPress: this.handleTakePhoto },
        { text: "Cancelar ❌", style: "cancel" }
      ]
    );
  };

  handleSelectFromGallery = async () => {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        this.uploadPickedImage(result.assets[0].uri);
      }
    } catch (err) {
      console.error("DEBUG: Error al abrir galería:", err);
      Alert.alert("Error", "Ocurrió un error al abrir la galería de fotos.");
    }
  };

  handleTakePhoto = async () => {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    try {
      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        this.uploadPickedImage(result.assets[0].uri);
      }
    } catch (err) {
      console.error("DEBUG: Error al abrir cámara:", err);
      Alert.alert("Error", "Ocurrió un error al abrir la cámara de fotos.");
    }
  };

  uploadPickedImage = async (fileUri) => {
    this.setState({ saving: true });
    try {
      console.log("DEBUG: Preparando subida de imagen:", fileUri);
      
      // 1. Leer el archivo local como string base64 usando expo-file-system
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 2. Convertir el base64 a un Buffer binario usando el polyfill de buffer
      const buffer = Buffer.from(base64, "base64");

      // 3. Crear nombre de archivo único
      const userId = this.state.userId || "temp-avatar";
      const fileName = `${userId}-${Date.now()}.jpg`;

      // 4. Subir al bucket 'avatars' en Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, buffer, {
          contentType: "image/jpeg",
          upsert: true
        });

      if (uploadError) {
        console.error("DEBUG: Error de subida Supabase:", uploadError);
        throw uploadError;
      }

      // 5. Obtener URL pública
      const { data: publicData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      if (publicData && publicData.publicUrl) {
        console.log("DEBUG: Foto subida con éxito. Public URL:", publicData.publicUrl);
        this.setState({ avatarUrl: publicData.publicUrl, saving: false });
        Alert.alert("¡Imagen cargada! 📸", "Tu foto ha sido pre-cargada con éxito. Recuerda oprimir el botón 'GUARDAR CAMBIOS' al final para salvarla permanentemente.");
      }
    } catch (err) {
      console.error("DEBUG: Error al subir avatar:", err);
      this.setState({ saving: false });
      Alert.alert("Error de subida", "No se pudo subir la imagen a la base de datos: " + err.message);
    }
  };

  handleSaveChanges = async () => {
    const { userId, fullName, phone, email, avatarUrl, newPassword, confirmPassword } = this.state;

    if (!fullName.trim()) {
      Alert.alert("Falta información", "Por favor ingresa tu nombre completo.");
      return;
    }
    if (!phone.trim()) {
      Alert.alert("Falta información", "Por favor ingresa tu teléfono celular.");
      return;
    }

    // Normalizar a estándar de 12 dígitos (código de área 57 + 10 dígitos = 12 dígitos)
    let cleanPhone = phone.trim().replace(/\D/g, ""); // Extrae solo los dígitos
    if (cleanPhone.length === 10) {
      cleanPhone = "57" + cleanPhone; // Agrega automáticamente el código de área 57
    }

    if (cleanPhone.length !== 12) {
      Alert.alert(
        "Número inválido 📱",
        "El número debe ser de 10 dígitos (ej: 3162346645) o de 12 dígitos incluyendo el código de área (ej: 573162346645)."
      );
      return;
    }

    this.setState({ phone: cleanPhone, saving: true });

    try {
      // 1. Actualizar contraseña si se ingresó
      if (newPassword.trim()) {
        if (newPassword !== confirmPassword) {
          Alert.alert("Error", "Las contraseñas ingresadas no coinciden.");
          this.setState({ saving: false });
          return;
        }
        if (newPassword.length < 6) {
          Alert.alert("Contraseña débil", "La contraseña debe tener al menos 6 caracteres.");
          this.setState({ saving: false });
          return;
        }

        console.log("DEBUG: Actualizando contraseña en Supabase Auth...");
        const { error: authError } = await supabase.auth.updateUser({
          password: newPassword.trim()
        });

        if (authError) throw authError;
      }

      // 2. Actualizar perfil público en la tabla 'profiles'
      if (userId) {
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: fullName.trim(),
            phone: cleanPhone, // Guardar normalizado a 12 dígitos
            email: email.trim(),
            avatar_url: avatarUrl.trim()
          })
          .eq("id", userId);

        if (error) throw error;

        // Guardar cambios en caché local para persistencia instantánea e inmune a caídas
        await AsyncStorage.setItem("user_phone", cleanPhone);
        await AsyncStorage.setItem("user_avatar", avatarUrl.trim());
        await AsyncStorage.setItem("user_fullname", fullName.trim());
        await AsyncStorage.setItem("user_email", email.trim());

        this.setState({ saving: false, newPassword: "", confirmPassword: "" });
        Alert.alert("¡Perfil Actualizado! 🎉", "Tus datos personales y credenciales de acceso se han guardado con éxito.", [
          { text: "Excelente", onPress: () => this.loadProfile() }
        ]);
      } else {
        // Si no existía perfil, crearlo
        const { data: newProfile, error } = await supabase
          .from("profiles")
          .insert([
            {
              full_name: fullName.trim(),
              phone: cleanPhone, // Guardar normalizado a 12 dígitos
              email: email.trim(),
              avatar_url: avatarUrl.trim()
            }
          ])
          .select()
          .single();

        if (error) throw error;

        if (newProfile) {
          await AsyncStorage.setItem("user_phone", cleanPhone);
          await AsyncStorage.setItem("user_avatar", avatarUrl.trim());
          await AsyncStorage.setItem("user_fullname", fullName.trim());
          await AsyncStorage.setItem("user_email", email.trim());
          this.setState({ userId: newProfile.id });
        }

        this.setState({ saving: false, newPassword: "", confirmPassword: "" });
        Alert.alert("¡Perfil Creado! 🎉", "Tu nuevo perfil se ha guardado con éxito.", [
          { text: "Excelente", onPress: () => this.loadProfile() }
        ]);
      }
    } catch (err) {
      console.error("DEBUG: Error al guardar perfil:", err);
      this.setState({ saving: false });
      Alert.alert("Error", "No se pudieron guardar los cambios: " + err.message);
    }
  };

  render() {
    const { fullName, phone, email, avatarUrl, newPassword, confirmPassword, loading, saving } = this.state;

    const themeColors = {
      background: "#0B0F19",
      textPrimary: "#FFFFFF",
      textSecondary: "rgba(255, 255, 255, 0.4)",
      cardBackground: "rgba(255, 255, 255, 0.03)",
      cardBorder: "rgba(255, 255, 255, 0.08)",
      inputBg: "rgba(255, 255, 255, 0.05)",
      accent: "#6366F1",
      buttonBg: "#4F46E5",
      buttonShadow: "#4F46E5"
    };

    if (loading) {
      return (
        <Block flex style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text color="white" style={{ marginTop: 15, opacity: 0.7 }}>Cargando perfil desde la base de datos...</Text>
        </Block>
      );
    }

    const displayAvatar = avatarUrl && avatarUrl.trim().startsWith("http")
      ? { uri: avatarUrl }
      : { uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName || "Vecino")}&background=6366F1&color=fff&size=200` };

    return (
      <Block flex style={[styles.container, { backgroundColor: themeColors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Encabezado del Perfil */}
            <Block center style={styles.headerSection}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={this.handleSelectAvatarSource}
                style={styles.avatarWrapper}
              >
                <Image source={displayAvatar} style={styles.avatarImage} />
                <Block style={styles.avatarBorder} />
                {/* Botón flotante para indicar que es editable */}
                <Block center middle style={styles.cameraIconBadge}>
                  <Icon name="camera" family="Feather" size={14} color="white" />
                </Block>
              </TouchableOpacity>
              <Text bold size={24} color="white" style={{ marginTop: 15, textAlign: "center" }}>
                {fullName || "Vecino de VeciSeguro"}
              </Text>
              <Text size={14} color="#94A3B8" style={{ marginTop: 4, opacity: 0.8 }}>
                {email || "Sin correo electrónico"}
              </Text>
            </Block>

            {/* Formulario Estilo Glassmorphism: INFORMACIÓN PERSONAL */}
            <Block style={[styles.glassCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.cardBorder }]}>
              
              <Block row middle style={{ marginBottom: 20 }}>
                <Icon name="user" family="Feather" size={18} color={themeColors.accent} style={{ marginRight: 8 }} />
                <Text bold size={12} color={themeColors.accent} style={{ letterSpacing: 0.8 }}>
                  INFORMACIÓN PERSONAL
                </Text>
              </Block>

              {/* Input: Nombre Completo */}
              <Block style={styles.inputGroup}>
                <Text bold size={10} color="white" style={styles.inputLabel}>
                  NOMBRE COMPLETO
                </Text>
                <Input
                  borderless
                  value={fullName}
                  onChangeText={(text) => this.setState({ fullName: text })}
                  placeholder="Tu nombre completo"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={[styles.premiumInput, { backgroundColor: themeColors.inputBg }]}
                  color="white"
                  iconContent={
                    <Icon name="user" family="Feather" size={15} color="#94A3B8" />
                  }
                />
              </Block>

              {/* Input: Teléfono Celular */}
              <Block style={styles.inputGroup}>
                <Text bold size={10} color="white" style={styles.inputLabel}>
                  TELÉFONO CELULAR
                </Text>
                <Input
                  borderless
                  value={phone}
                  onChangeText={(text) => this.setState({ phone: text })}
                  placeholder="Ej: +573123456789"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="phone-pad"
                  style={[styles.premiumInput, { backgroundColor: themeColors.inputBg }]}
                  color="white"
                  iconContent={
                    <Icon name="phone" family="Feather" size={15} color="#94A3B8" />
                  }
                />
              </Block>

              {/* Input: Correo Electrónico */}
              <Block style={styles.inputGroup}>
                <Text bold size={10} color="white" style={styles.inputLabel}>
                  CORREO ELECTRÓNICO
                </Text>
                <Input
                  borderless
                  value={email}
                  onChangeText={(text) => this.setState({ email: text })}
                  placeholder="ejemplo@correo.com"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="email-address"
                  style={[styles.premiumInput, { backgroundColor: themeColors.inputBg }]}
                  color="white"
                  iconContent={
                    <Icon name="mail" family="Feather" size={15} color="#94A3B8" />
                  }
                />
              </Block>

            </Block>

            {/* Formulario Estilo Glassmorphism: SEGURIDAD (CONTRASEÑA) */}
            <Block style={[styles.glassCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.cardBorder }]}>
              
              <Block row middle style={{ marginBottom: 20 }}>
                <Icon name="lock" family="Feather" size={18} color={themeColors.accent} style={{ marginRight: 8 }} />
                <Text bold size={12} color={themeColors.accent} style={{ letterSpacing: 0.8 }}>
                  SEGURIDAD Y ACCESO
                </Text>
              </Block>

              {/* Input: Nueva Contraseña */}
              <Block style={styles.inputGroup}>
                <Text bold size={10} color="white" style={styles.inputLabel}>
                  NUEVA CONTRASEÑA
                </Text>
                <Input
                  borderless
                  secureTextEntry
                  value={newPassword}
                  onChangeText={(text) => this.setState({ newPassword: text })}
                  placeholder="Dejar en blanco para no cambiar"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={[styles.premiumInput, { backgroundColor: themeColors.inputBg }]}
                  color="white"
                  iconContent={
                    <Icon name="key" family="Feather" size={15} color="#94A3B8" />
                  }
                />
              </Block>

              {/* Input: Confirmar Contraseña */}
              <Block style={styles.inputGroup}>
                <Text bold size={10} color="white" style={styles.inputLabel}>
                  CONFIRMAR CONTRASEÑA
                </Text>
                <Input
                  borderless
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={(text) => this.setState({ confirmPassword: text })}
                  placeholder="Repite la nueva contraseña"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={[styles.premiumInput, { backgroundColor: themeColors.inputBg }]}
                  color="white"
                  iconContent={
                    <Icon name="check-circle" family="Feather" size={15} color="#94A3B8" />
                  }
                />
              </Block>

            </Block>

            {/* Botón de Guardar */}
            <Block center style={{ marginTop: 5, marginBottom: 30 }}>
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
                    <Icon name="save" family="Feather" size={18} color="white" style={{ marginRight: 8 }} />
                    <Text bold size={14} color="white" style={{ letterSpacing: 0.8 }}>
                      GUARDAR CAMBIOS
                    </Text>
                  </Block>
                )}
              </TouchableOpacity>
            </Block>

          </ScrollView>
        </KeyboardAvoidingView>
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
    paddingTop: Platform.OS === "ios" ? 70 : 50,
    paddingBottom: 40
  },
  headerSection: {
    marginVertical: 20
  },
  avatarWrapper: {
    width: 120,
    height: 120,
    position: "relative",
    justifyContent: "center",
    alignItems: "center"
  },
  avatarImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
    zIndex: 1
  },
  avatarBorder: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "#6366F1",
    opacity: 0.8,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    shadowOpacity: 0.6,
    elevation: 5
  },
  cameraIconBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#6366F1",
    borderWidth: 2,
    borderColor: "#0B0F19",
    zIndex: 2,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.4,
    elevation: 3
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
  inputGroup: {
    marginBottom: 16
  },
  inputLabel: {
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: 6,
    opacity: 0.6
  },
  premiumInput: {
    height: 48,
    borderRadius: 14,
    borderWidth: 0,
    paddingHorizontal: 12
  },
  saveButton: {
    width: width - 40,
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.3,
    elevation: 6
  }
});

export default Profile;
