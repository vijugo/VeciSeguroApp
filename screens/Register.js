import React from "react";
import {
  StyleSheet,
  ImageBackground,
  Dimensions,
  StatusBar,
  KeyboardAvoidingView,
  ActivityIndicator,
  TouchableOpacity
} from "react-native";
import { Block, Text, theme, Button } from "galio-framework";
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Icon, Input } from "../components";
import { Images, argonTheme } from "../constants";
import { supabase } from '../constants/Supabase';

const { width, height } = Dimensions.get("screen");

class Register extends React.Component {
  state = {
    phone: '',
    password: '',
    fullName: '',
    otp: '',
    newPassword: '',
    loading: false,
    mode: 'login', // 'login', 'register', 'forgot_password', 'verify_signup', 'verify_reset', 'set_new_password'
    showPassword: false,
    showNewPassword: false,
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
    const { phone, password } = this.state;
    if (!phone || !password) {
      alert("Por favor ingresa tu número y contraseña");
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
        // Confirm Phone is OFF in Supabase - instant signup & login!
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
        // Confirm Phone is ON - verify via SMS OTP
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

      // Upsert public profile record
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
        return "Inicia sesión con tu celular y contraseña";
      case 'register':
        return "Crea una cuenta para proteger a tu barrio";
      case 'forgot_password':
        return "Recibe un código SMS para restablecer tu cuenta";
      case 'verify_signup':
      case 'verify_reset':
        return "Ingresa el código de 6 dígitos enviado";
      case 'set_new_password':
        return "Escribe tu nueva contraseña de acceso";
      default:
        return "Acceso Seguro";
    }
  };

  render() {
    const { navigation } = this.props;
    const { mode, loading, phone, password, fullName, otp, newPassword, showPassword, showNewPassword } = this.state;

    return (
      <Block flex middle>
        <StatusBar hidden />
        <ImageBackground
          source={Images.RegisterBackground}
          style={{ width, height, zIndex: 1 }}
        >
          <Block safe flex middle>
            <Block style={styles.registerContainer}>
              <Block flex={0.15} middle style={styles.socialConnect}>
                <Text color={argonTheme.COLORS.PRIMARY} size={16} bold>
                  VECISEGURO
                </Text>
              </Block>
              <Block flex>
                <Block flex={0.12} middle style={{ marginTop: 10 }}>
                  <Text color="#8898AA" size={13} bold>
                    {this.renderHeaderSubtitle()}
                  </Text>
                </Block>
                <Block flex center>
                  <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior="padding"
                    enabled
                  >
                    
                    {/* --- MODE: LOGIN --- */}
                    {mode === 'login' && (
                      <Block width={width * 0.8}>
                        <Input
                          borderless
                          placeholder="Número de celular"
                          keyboardType="phone-pad"
                          value={phone}
                          onChangeText={(text) => this.setState({ phone: text })}
                          iconContent={
                            <Icon
                              size={16}
                              color={argonTheme.COLORS.ICON}
                              name="phone"
                              family="Entypo"
                              style={styles.inputIcons}
                            />
                          }
                        />
                        <Input
                          borderless
                          placeholder="Contraseña"
                          secureTextEntry={!showPassword}
                          value={password}
                          onChangeText={(text) => this.setState({ password: text })}
                          right
                          iconContent={
                            <TouchableOpacity onPress={() => this.setState({ showPassword: !showPassword })}>
                              <Icon
                                size={16}
                                color={argonTheme.COLORS.ICON}
                                name={showPassword ? "eye" : "eye-with-line"}
                                family="Entypo"
                                style={styles.inputIcons}
                              />
                            </TouchableOpacity>
                          }
                        />
                        <Block middle>
                          <Button 
                            color="primary" 
                            style={styles.actionButton}
                            onPress={this.handleLoginWithPassword}
                            disabled={loading}
                          >
                            {loading ? <ActivityIndicator color="white" /> : (
                              <Text bold size={14} color={argonTheme.COLORS.WHITE}>
                                INICIAR SESIÓN
                              </Text>
                            )}
                          </Button>
                          <Button 
                            color="transparent" 
                            onPress={() => this.setState({ mode: 'register' })}
                            style={{ marginTop: 15 }}
                          >
                            <Text size={12} color={argonTheme.COLORS.PRIMARY} bold>
                              ¿No tienes cuenta? Regístrate
                            </Text>
                          </Button>
                          <Button 
                            color="transparent" 
                            onPress={() => this.setState({ mode: 'forgot_password' })}
                            style={{ marginTop: 5 }}
                          >
                            <Text size={12} color={argonTheme.COLORS.MUTED}>
                              ¿Olvidaste tu contraseña?
                            </Text>
                          </Button>
                          <Button 
                            color="warning" 
                            onPress={async () => {
                              console.log("DEBUG: Modo invitado:", phone || '3162346645');
                              await AsyncStorage.setItem('user_phone', phone || '3162346645');
                              navigation.navigate("App");
                            }}
                            style={{ marginTop: 25, width: width * 0.7, alignSelf: 'center' }}
                          >
                            <Text bold size={11} color={argonTheme.COLORS.WHITE}>
                              PROBAR INTERFAZ (INVITADO)
                            </Text>
                          </Button>
                        </Block>
                      </Block>
                    )}

                    {/* --- MODE: REGISTER --- */}
                    {mode === 'register' && (
                      <Block width={width * 0.8}>
                        <Input
                          borderless
                          placeholder="Nombre Completo"
                          value={fullName}
                          onChangeText={(text) => this.setState({ fullName: text })}
                          iconContent={
                            <Icon
                              size={16}
                              color={argonTheme.COLORS.ICON}
                              name="user"
                              family="Entypo"
                              style={styles.inputIcons}
                            />
                          }
                        />
                        <Input
                          borderless
                          placeholder="Número de celular"
                          keyboardType="phone-pad"
                          value={phone}
                          onChangeText={(text) => this.setState({ phone: text })}
                          iconContent={
                            <Icon
                              size={16}
                              color={argonTheme.COLORS.ICON}
                              name="phone"
                              family="Entypo"
                              style={styles.inputIcons}
                            />
                          }
                        />
                        <Input
                          borderless
                          placeholder="Crear Contraseña"
                          secureTextEntry={!showPassword}
                          value={password}
                          onChangeText={(text) => this.setState({ password: text })}
                          right
                          iconContent={
                            <TouchableOpacity onPress={() => this.setState({ showPassword: !showPassword })}>
                              <Icon
                                size={16}
                                color={argonTheme.COLORS.ICON}
                                name={showPassword ? "eye" : "eye-with-line"}
                                family="Entypo"
                                style={styles.inputIcons}
                              />
                            </TouchableOpacity>
                          }
                        />
                        <Block middle>
                          <Button 
                            color="primary" 
                            style={styles.actionButton}
                            onPress={this.handleRegister}
                            disabled={loading}
                          >
                            {loading ? <ActivityIndicator color="white" /> : (
                              <Text bold size={14} color={argonTheme.COLORS.WHITE}>
                                REGISTRARSE
                              </Text>
                            )}
                          </Button>
                          <Button 
                            color="transparent" 
                            onPress={() => this.setState({ mode: 'login' })}
                            style={{ marginTop: 15 }}
                          >
                            <Text size={12} color={argonTheme.COLORS.PRIMARY} bold>
                              ¿Ya tienes cuenta? Inicia sesión
                            </Text>
                          </Button>
                        </Block>
                      </Block>
                    )}

                    {/* --- MODE: FORGOT PASSWORD --- */}
                    {mode === 'forgot_password' && (
                      <Block width={width * 0.8}>
                        <Input
                          borderless
                          placeholder="Número de celular"
                          keyboardType="phone-pad"
                          value={phone}
                          onChangeText={(text) => this.setState({ phone: text })}
                          iconContent={
                            <Icon
                              size={16}
                              color={argonTheme.COLORS.ICON}
                              name="phone"
                              family="Entypo"
                              style={styles.inputIcons}
                            />
                          }
                        />
                        <Block middle>
                          <Button 
                            color="primary" 
                            style={styles.actionButton}
                            onPress={this.handleForgotPasswordSend}
                            disabled={loading}
                          >
                            {loading ? <ActivityIndicator color="white" /> : (
                              <Text bold size={14} color={argonTheme.COLORS.WHITE}>
                                ENVIAR CÓDIGO SMS
                              </Text>
                            )}
                          </Button>
                          <Button 
                            color="transparent" 
                            onPress={() => this.setState({ mode: 'login' })}
                            style={{ marginTop: 15 }}
                          >
                            <Text size={12} color={argonTheme.COLORS.PRIMARY} bold>
                              Volver a Iniciar Sesión
                            </Text>
                          </Button>
                        </Block>
                      </Block>
                    )}

                    {/* --- MODE: VERIFY SIGNUP --- */}
                    {mode === 'verify_signup' && (
                      <Block width={width * 0.8}>
                        <Input
                          borderless
                          placeholder="Código de 6 dígitos"
                          keyboardType="number-pad"
                          maxLength={6}
                          value={otp}
                          onChangeText={(text) => this.setState({ otp: text })}
                          iconContent={
                            <Icon
                              size={16}
                              color={argonTheme.COLORS.ICON}
                              name="key"
                              family="Entypo"
                              style={styles.inputIcons}
                            />
                          }
                        />
                        <Block middle>
                          <Button 
                            color="primary" 
                            style={styles.actionButton}
                            onPress={this.handleVerifySignupOtp}
                            disabled={loading}
                          >
                            {loading ? <ActivityIndicator color="white" /> : (
                              <Text bold size={14} color={argonTheme.COLORS.WHITE}>
                                VERIFICAR Y ENTRAR
                              </Text>
                            )}
                          </Button>
                          <Button 
                            color="transparent" 
                            onPress={() => this.setState({ mode: 'register' })}
                            style={{ marginTop: 15 }}
                          >
                            <Text size={12} color={argonTheme.COLORS.MUTED}>
                              Volver a intentar
                            </Text>
                          </Button>
                        </Block>
                      </Block>
                    )}

                    {/* --- MODE: VERIFY RESET --- */}
                    {mode === 'verify_reset' && (
                      <Block width={width * 0.8}>
                        <Input
                          borderless
                          placeholder="Código de 6 dígitos"
                          keyboardType="number-pad"
                          maxLength={6}
                          value={otp}
                          onChangeText={(text) => this.setState({ otp: text })}
                          iconContent={
                            <Icon
                              size={16}
                              color={argonTheme.COLORS.ICON}
                              name="key"
                              family="Entypo"
                              style={styles.inputIcons}
                            />
                          }
                        />
                        <Block middle>
                          <Button 
                            color="primary" 
                            style={styles.actionButton}
                            onPress={this.handleVerifyResetOtp}
                            disabled={loading}
                          >
                            {loading ? <ActivityIndicator color="white" /> : (
                              <Text bold size={14} color={argonTheme.COLORS.WHITE}>
                                VERIFICAR CÓDIGO
                              </Text>
                            )}
                          </Button>
                          <Button 
                            color="transparent" 
                            onPress={() => this.setState({ mode: 'forgot_password' })}
                            style={{ marginTop: 15 }}
                          >
                            <Text size={12} color={argonTheme.COLORS.MUTED}>
                              Volver a enviar
                            </Text>
                          </Button>
                        </Block>
                      </Block>
                    )}

                    {/* --- MODE: SET NEW PASSWORD --- */}
                    {mode === 'set_new_password' && (
                      <Block width={width * 0.8}>
                        <Input
                          borderless
                          placeholder="Nueva Contraseña"
                          secureTextEntry={!showNewPassword}
                          value={newPassword}
                          onChangeText={(text) => this.setState({ newPassword: text })}
                          right
                          iconContent={
                            <TouchableOpacity onPress={() => this.setState({ showNewPassword: !showNewPassword })}>
                              <Icon
                                size={16}
                                color={argonTheme.COLORS.ICON}
                                name={showNewPassword ? "eye" : "eye-with-line"}
                                family="Entypo"
                                style={styles.inputIcons}
                              />
                            </TouchableOpacity>
                          }
                        />
                        <Block middle>
                          <Button 
                            color="primary" 
                            style={styles.actionButton}
                            onPress={this.handleSetNewPassword}
                            disabled={loading}
                          >
                            {loading ? <ActivityIndicator color="white" /> : (
                              <Text bold size={14} color={argonTheme.COLORS.WHITE}>
                                ACTUALIZAR CONTRASEÑA
                              </Text>
                            )}
                          </Button>
                        </Block>
                      </Block>
                    )}

                  </KeyboardAvoidingView>
                </Block>
              </Block>
            </Block>
          </Block>
        </ImageBackground>
      </Block>
    );
  }
}

const styles = StyleSheet.create({
  registerContainer: {
    width: width * 0.9,
    height: height * 0.875,
    backgroundColor: "#F4F5F7",
    borderRadius: 4,
    shadowColor: argonTheme.COLORS.BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    shadowOpacity: 0.1,
    elevation: 1,
    overflow: "hidden"
  },
  socialConnect: {
    backgroundColor: argonTheme.COLORS.WHITE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#8898AA"
  },
  inputIcons: {
    marginRight: 12
  },
  actionButton: {
    width: width * 0.7,
    marginTop: 25,
    alignSelf: 'center'
  }
});

export default Register;
