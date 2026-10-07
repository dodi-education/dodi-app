import { useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "./icon";
import { Input, type InputProps } from "./input";

/** The web's PasswordInput: an Input with the eye toggle on the right. */
export function PasswordInput({
  showPasswordLabel,
  hidePasswordLabel,
  className,
  ...props
}: InputProps & { showPasswordLabel: string; hidePasswordLabel: string }) {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <View className="relative w-full justify-center">
      <Input
        secureTextEntry={!isVisible}
        autoCapitalize="none"
        autoCorrect={false}
        className={["pr-10", className].filter(Boolean).join(" ")}
        {...props}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isVisible ? hidePasswordLabel : showPasswordLabel}
        onPress={() => setIsVisible((v) => !v)}
        hitSlop={{ top: 8, bottom: 8, left: 14, right: 14 }}
        className="absolute right-3 h-full justify-center"
      >
        <Icon name={isVisible ? "hide" : "show"} size={16} color="muted-foreground" />
      </Pressable>
    </View>
  );
}
