import { Block, Text, theme } from "galio-framework";
import { Image, ScrollView, StyleSheet, Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DrawerItem as DrawerCustomItem } from "../components";
import Images from "../constants/Images";
import React, { useState, useEffect } from "react";

function CustomDrawerContent({
  drawerPosition,
  navigation,
  profile,
  focused,
  state,
  ...rest
}) {
  const screens = ["Home", "Profile", "History", "Notifications", "About", "Account"];
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedMode = await AsyncStorage.getItem("@veciseguro:dark_mode");
        if (savedMode !== null) {
          setDarkMode(JSON.parse(savedMode));
        } else {
          setDarkMode(Appearance.getColorScheme() === "dark");
        }
      } catch (e) {
        console.log("Error loading dark mode in Menu", e);
      }
    };
    loadTheme();

    // Actualizar cada vez que cambie el estado de navegación (por ejemplo, al abrir el menú)
    const unsubscribe = navigation.addListener("state", () => {
      loadTheme();
    });

    return () => {
      unsubscribe();
    };
  }, [navigation]);

  return (
    <Block
      style={[styles.container, { backgroundColor: darkMode ? "#0B0F19" : "#FFFFFF" }]}
      forceInset={{ top: "always", horizontal: "never" }}
    >
      <Block flex={0.12} row style={[styles.header, { alignItems: "center" }]}>
        <Image style={styles.logo} source={Images.Logo} />
        <Text bold size={20} color={darkMode ? "#FFFFFF" : "#1E293B"} style={{ marginLeft: 12 }}>
          VeciSeguro
        </Text>
      </Block>
      <Block flex style={{ paddingLeft: 8, paddingRight: 14 }}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {screens.map((item, index) => {
            return (
              <DrawerCustomItem
                title={item}
                key={index}
                navigation={navigation}
                focused={state.index === index ? true : false}
                darkMode={darkMode}
              />
            );
          })}
        </ScrollView>
      </Block>
    </Block>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 28,
    paddingBottom: theme.SIZES.BASE,
    paddingTop: theme.SIZES.BASE * 3.5,
    justifyContent: "center",
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 14,
  },
});

export default CustomDrawerContent;
