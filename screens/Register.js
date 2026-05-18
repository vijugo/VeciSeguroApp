import React from "react";
import {
  StyleSheet,
  Dimensions,
  StatusBar,
  KeyboardAvoidingView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  SafeAreaView
} from "react-native";
import { Block, Text } from "galio-framework";
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Icon } from "../components";
import { argonTheme } from "../constants";
import { supabase } from '../constants/Supabase';

const { width, height } = Dimensions.get("window");

class Register extends React.Component {
  state = {
    phone: '',
    email: '',
    password: '',
    fullName: '',
    otp: '',
    newPassword: '',
    loading: false,
    mode: 'login', // 'login', 'register', 'forgot_password', 'verify_signup', 'verify_reset', 'set_new_password'
    showPassword: false,
    showNewPassword: false,
    activeTab: 'admin', // 'admin' or 'vecino'
  };

  async componentDidMount() {
    try {
      const phone = await AsyncStorage.getItem('user_phone');
      if (phone) {
        console.log("DEBUG: ¡Sesión activa detectada en Registro! Saltando directo a la App:", phone);
        this.props.navigation.navigate("App");
      }
    } catch (err) {
      console.warn("DEBUG: Error al auto-iniciar sesión en registro:", err.message);
    }
  }

  handleLoginWithPassword = async () => {
    const { phone, email, password, activeTab } = this.state;
    
    if (activeTab === 'admin') {
      if (!email || !password) {
        alert("Por favor ingresa tu correo electrónico y contraseña");
        return;
      }
      this.setState({ loading: true });
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });
        if (error) throw error;
        await AsyncStorage.setItem('user_phone', email.trim());
        this.props.navigation.navigate("App");
      } catch (error) {
        alert(error.message);
      } finally {
        this.setState({ loading: false });
      }
    } else {
      if (!phone || !password) {
        alert("Por favor ingresa tu número de celular y contraseña");
        return;
      }
      this.setState({ loading: true });
      try {
        const formattedPhone = phone.startsWith("+") ? phone : `+57${phone}`;
        const { data, error } = await supabase.auth.signInWithPassword({
          phone: formattedPhone,
          password: password,
        });
        if (error) throw error;
        await AsyncStorage.setItem('user_phone', formattedPhone);
        this.props.navigation.navigate("App");
      } catch (error) {
        alert(error.message);
      } finally {
        this.setState({ loading: false });
      }
    }
  };

  handleRegister = async () => {
    const { phone, password, fullName } = this.state;
    if (!phone || !password || !fullName) {
      alert("Por favor completa todos los campos");
      return;
    }
    this.setState({ loading: true });
    try {
      const formattedPhone = phone.startsWith("+") ? phone : `+57${phone}`;
      const { data, error } = await supabase.auth.signUp({
        phone: formattedPhone,
        password: password,
        options: {
          data: {
            full_name: fullName,
          }
        }
      });
      if (error) throw error;
      
      if (data && data.session) {
        const { user } = data;
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            full_name: fullName,
            phone: formattedPhone,
            email: user.email || '',
          });
        if (profileError) console.warn("Error creating profile:", profileError.message);

        await AsyncStorage.setItem('user_phone', formattedPhone);
        alert("¡Registro exitoso! Bienvenido a VeciSeguro.");
        this.props.navigation.navigate("App");
      } else {
        this.setState({ mode: 'verify_signup' });
        alert("Código de verificación enviado por SMS");
      }
    } catch (error) {
      alert(error.message);
    } finally {
      this.setState({ loading: false });
    }
  };

  handleVerifySignupOtp = async () => {
    const { phone, otp, fullName } = this.state;
    if (!otp) {
      alert("Por favor ingresa el código");
      return;
    }
    this.setState({ loading: true });
    try {
      const formattedPhone = phone.startsWith("+") ? phone : `+57${phone}`;
      const { error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp,
        type: 'signup',
      });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            full_name: fullName,
            phone: formattedPhone,
            email: user.email || '',
          });
        if (profileError) console.warn("Error creating profile:", profileError.message);
      }

      await AsyncStorage.setItem('user_phone', formattedPhone);
      this.props.navigation.navigate("App");
    } catch (error) {
      alert(error.message);
    } finally {
      this.setState({ loading: false });
    }
  };

  handleForgotPasswordSend = async () => {
    const { phone } = this.state;
    if (!phone) {
      alert("Por favor ingresa tu número de celular");
      return;
    }
    this.setState({ loading: true });
    try {
      const formattedPhone = phone.startsWith("+") ? phone : `+57${phone}`;
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });
      if (error) throw error;
      this.setState({ mode: 'verify_reset' });
      alert("Código de recuperación enviado por SMS");
    } catch (error) {
      alert(error.message);
    } finally {
      this.setState({ loading: false });
    }
  };

  handleVerifyResetOtp = async () => {
    const { phone, otp } = this.state;
    if (!otp) {
      alert("Por favor ingresa el código");
      return;
    }
    this.setState({ loading: true });
    try {
      const formattedPhone = phone.startsWith("+") ? phone : `+57${phone}`;
      const { error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp,
        type: 'sms',
      });
      if (error) throw error;
      this.setState({ mode: 'set_new_password' });
    } catch (error) {
      alert(error.message);
    } finally {
      this.setState({ loading: false });
    }
  };

  handleSetNewPassword = async () => {
    const { newPassword, phone } = this.state;
    if (!newPassword) {
      alert("Por favor ingresa la nueva contraseña");
      return;
    }
    this.setState({ loading: true });
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      
      const formattedPhone = phone.startsWith("+") ? phone : `+57${phone}`;
      await AsyncStorage.setItem('user_phone', formattedPhone);
      alert("Contraseña actualizada correctamente");
      this.props.navigation.navigate("App");
    } catch (error) {
      alert(error.message);
    } finally {
      this.setState({ loading: false });
    }
  };

  renderHeaderSubtitle = () => {
    const { mode } = this.state;
    switch (mode) {
      case 'login':
        return "Ingresa tus credenciales para acceder al panel de control de seguridad.";
      case 'register':
        return "Crea una cuenta para proteger a tu barrio.";
      case 'forgot_password':
        return "Recibe un código SMS para restablecer tu cuenta.";
      case 'verify_signup':
      case 'verify_reset':
        return "Ingresa el código de 6 dígitos enviado.";
      case 'set_new_password':
        return "Escribe tu nueva contraseña de acceso.";
      default:
        return "Acceso Seguro";
    }
  };

  render() {
    const { mode, loading, phone, email, password, fullName, otp, newPassword, showPassword, showNewPassword, activeTab } = this.state;

    return (
      <SafeAreaView style={styles.safeContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Minimalist Shield Card */}
            <Block style={styles.shieldContainer}>
              <Icon name="shield" family="Feather" size={30} color="#121212" />
            </Block>

            {/* Title & Subtitle */}
            <Text style={styles.titleText}>
              VeciSeguro <Text style={styles.blueTitleText}>Cloud</Text>
            </Text>
            <Text style={styles.subtitleText}>
              {this.renderHeaderSubtitle()}
            </Text>

            {/* --- MODE: LOGIN --- */}
            {mode === 'login' && (
              <Block style={styles.formContainer}>
                {/* Segmented Tab Selector */}
                <Block row style={styles.tabContainer}>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'admin' && styles.tabButtonActive]}
                    onPress={() => this.setState({ activeTab: 'admin' })}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.tabText, activeTab === 'admin' && styles.tabTextActive]}>
                      Administrador
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'vecino' && styles.tabButtonActive]}
                    onPress={() => this.setState({ activeTab: 'vecino' })}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.tabText, activeTab === 'vecino' && styles.tabTextActive]}>
                      Vecino
                    </Text>
                  </TouchableOpacity>
                </Block>

                {/* Fields */}
                {activeTab === 'admin' ? (
                  <Block style={styles.inputGroup}>
                    <Text style={styles.fieldLabel}>Correo Electrónico</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="admin@veciseguro.com"
                      placeholderTextColor="#94A3B8"
                      value={email}
                      onChangeText={(text) => this.setState({ email: text })}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </Block>
                ) : (
                  <Block style={styles.inputGroup}>
                    <Text style={styles.fieldLabel}>Número de celular</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="316 234 6645"
                      placeholderTextColor="#94A3B8"
                      value={phone}
                      onChangeText={(text) => this.setState({ phone: text })}
                      keyboardType="phone-pad"
                    />
                  </Block>
                )}

                <Block style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Contraseña</Text>
                  <Block style={styles.passwordInputWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="........"
                      placeholderTextColor="#94A3B8"
                      value={password}
                      onChangeText={(text) => this.setState({ password: text })}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.passwordEye}
                      onPress={() => this.setState({ showPassword: !showPassword })}
                    >
                      <Icon
                        size={18}
                        color="#64748B"
                        name={showPassword ? "eye" : "eye-with-line"}
                        family="Entypo"
                      />
                    </TouchableOpacity>
                  </Block>
                </Block>

                {/* Actions */}
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={this.handleLoginWithPassword}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Iniciar Sesión</Text>
                  )}
                </TouchableOpacity>

                {/* Alternate Actions Links */}
                <Block row style={styles.footerLinkContainer}>
                  <Text style={styles.footerLinkText}>¿No tienes una cuenta? </Text>
                  <TouchableOpacity onPress={() => this.setState({ mode: 'register' })}>
                    <Text style={styles.footerLinkBoldText}>Regístrate aquí</Text>
                  </TouchableOpacity>
                </Block>

                <TouchableOpacity
                  style={styles.forgotPasswordLink}
                  onPress={() => this.setState({ mode: 'forgot_password' })}
                >
                  <Text style={styles.forgotPasswordText}>¿Olvidaste tu contraseña?</Text>
                </TouchableOpacity>
              </Block>
            )}

            {/* --- MODE: REGISTER --- */}
            {mode === 'register' && (
              <Block style={styles.formContainer}>
                <Block style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Nombre Completo</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Víctor Julio González"
                    placeholderTextColor="#94A3B8"
                    value={fullName}
                    onChangeText={(text) => this.setState({ fullName: text })}
                  />
                </Block>

                <Block style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Número de celular</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="316 234 6645"
                    placeholderTextColor="#94A3B8"
                    value={phone}
                    onChangeText={(text) => this.setState({ phone: text })}
                    keyboardType="phone-pad"
                  />
                </Block>

                <Block style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Contraseña</Text>
                  <Block style={styles.passwordInputWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Crear contraseña"
                      placeholderTextColor="#94A3B8"
                      value={password}
                      onChangeText={(text) => this.setState({ password: text })}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.passwordEye}
                      onPress={() => this.setState({ showPassword: !showPassword })}
                    >
                      <Icon
                        size={18}
                        color="#64748B"
                        name={showPassword ? "eye" : "eye-with-line"}
                        family="Entypo"
                      />
                    </TouchableOpacity>
                  </Block>
                </Block>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={this.handleRegister}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Registrarse</Text>
                  )}
                </TouchableOpacity>

                <Block row style={styles.footerLinkContainer}>
                  <Text style={styles.footerLinkText}>¿Ya tienes cuenta? </Text>
                  <TouchableOpacity onPress={() => this.setState({ mode: 'login' })}>
                    <Text style={styles.footerLinkBoldText}>Inicia sesión</Text>
                  </TouchableOpacity>
                </Block>
              </Block>
            )}

            {/* --- MODE: FORGOT PASSWORD --- */}
            {mode === 'forgot_password' && (
              <Block style={styles.formContainer}>
                <Block style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Número de celular</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="316 234 6645"
                    placeholderTextColor="#94A3B8"
                    value={phone}
                    onChangeText={(text) => this.setState({ phone: text })}
                    keyboardType="phone-pad"
                  />
                </Block>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={this.handleForgotPasswordSend}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Enviar Código SMS</Text>
                  )}
                </TouchableOpacity>

                <Block row style={styles.footerLinkContainer}>
                  <TouchableOpacity onPress={() => this.setState({ mode: 'login' })}>
                    <Text style={styles.footerLinkBoldText}>Volver a Iniciar Sesión</Text>
                  </TouchableOpacity>
                </Block>
              </Block>
            )}

            {/* --- MODE: VERIFY SIGNUP --- */}
            {mode === 'verify_signup' && (
              <Block style={styles.formContainer}>
                <Block style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Código de 6 dígitos</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="123456"
                    placeholderTextColor="#94A3B8"
                    value={otp}
                    onChangeText={(text) => this.setState({ otp: text })}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </Block>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={this.handleVerifySignupOtp}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Verificar y Entrar</Text>
                  )}
                </TouchableOpacity>

                <Block row style={styles.footerLinkContainer}>
                  <TouchableOpacity onPress={() => this.setState({ mode: 'register' })}>
                    <Text style={styles.footerLinkBoldText}>Volver a intentar</Text>
                  </TouchableOpacity>
                </Block>
              </Block>
            )}

            {/* --- MODE: VERIFY RESET --- */}
            {mode === 'verify_reset' && (
              <Block style={styles.formContainer}>
                <Block style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Código de 6 dígitos</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="123456"
                    placeholderTextColor="#94A3B8"
                    value={otp}
                    onChangeText={(text) => this.setState({ otp: text })}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </Block>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={this.handleVerifyResetOtp}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Verificar Código</Text>
                  )}
                </TouchableOpacity>

                <Block row style={styles.footerLinkContainer}>
                  <TouchableOpacity onPress={() => this.setState({ mode: 'forgot_password' })}>
                    <Text style={styles.footerLinkBoldText}>Volver a intentar</Text>
                  </TouchableOpacity>
                </Block>
              </Block>
            )}

            {/* --- MODE: SET NEW PASSWORD --- */}
            {mode === 'set_new_password' && (
              <Block style={styles.formContainer}>
                <Block style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Nueva Contraseña</Text>
                  <Block style={styles.passwordInputWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Nueva contraseña"
                      placeholderTextColor="#94A3B8"
                      value={newPassword}
                      onChangeText={(text) => this.setState({ newPassword: text })}
                      secureTextEntry={!showNewPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.passwordEye}
                      onPress={() => this.setState({ showNewPassword: !showNewPassword })}
                    >
                      <Icon
                        size={18}
                        color="#64748B"
                        name={showNewPassword ? "eye" : "eye-with-line"}
                        family="Entypo"
                      />
                    </TouchableOpacity>
                  </Block>
                </Block>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={this.handleSetNewPassword}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Actualizar Contraseña</Text>
                  )}
                </TouchableOpacity>
              </Block>
            )}

            {/* Version and Copyright Footer */}
            <Block style={styles.appFooter}>
              <Text style={styles.footerVersionText}>VeciSeguro Platform v2.1.0</Text>
              <Text style={styles.footerCopyrightText}>© 2026 VeciSeguro. Todos los derechos reservados.</Text>
            </Block>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF"
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: height * 0.05,
    paddingBottom: 20,
    alignItems: "center",
    flexGrow: 1
  },
  shieldContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.08,
    elevation: 2,
    alignSelf: "center",
    marginBottom: 20
  },
  titleText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium'
  },
  blueTitleText: {
    color: "#2563EB",
    fontWeight: "800"
  },
  subtitleText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 20,
    marginBottom: 28,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif'
  },
  formContainer: {
    width: "100%",
    maxWidth: 400
  },
  tabContainer: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    width: "100%"
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8
  },
  tabButtonActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.06,
    elevation: 2
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B"
  },
  tabTextActive: {
    color: "#0F172A",
    fontWeight: "700"
  },
  inputGroup: {
    width: "100%",
    marginBottom: 20
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "left"
  },
  textInput: {
    width: "100%",
    height: 48,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: "#0F172A"
  },
  passwordInputWrapper: {
    width: "100%",
    height: 48,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center"
  },
  passwordInput: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    color: "#0F172A"
  },
  passwordEye: {
    padding: 4
  },
  primaryButton: {
    backgroundColor: "#121212",
    borderRadius: 8,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    shadowOpacity: 0.08,
    elevation: 3
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF"
  },
  footerLinkContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
    marginBottom: 10
  },
  footerLinkText: {
    fontSize: 14,
    color: "#64748B"
  },
  footerLinkBoldText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A"
  },
  forgotPasswordLink: {
    alignSelf: "center",
    paddingVertical: 8
  },
  forgotPasswordText: {
    fontSize: 13,
    color: "#64748B",
    textDecorationLine: "underline"
  },
  appFooter: {
    marginTop: "auto",
    alignItems: "center",
    paddingVertical: 24,
    width: "100%"
  },
  footerVersionText: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 4,
    fontWeight: "500"
  },
  footerCopyrightText: {
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "center"
  }
});

export default Register;
