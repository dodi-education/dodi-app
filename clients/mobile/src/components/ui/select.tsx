import { type ReactNode, useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { fieldSelect, input } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

import { Icon } from "./icon";
import { Input } from "./input";
import { Sheet } from "./sheet";
import { Text } from "./text";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** Long lists (time zones) get a search field and a virtualized list. */
const SEARCH_THRESHOLD = 20;

/**
 * A field styled like the web's FieldRow select (fieldSelectClass); the
 * options open in the web's bottom Sheet, where a phone browser would show its
 * native picker.
 */
export function Select<T extends string>({
  value,
  options,
  onValueChange,
  label,
  placeholder,
  searchPlaceholder,
  disabled,
  className,
  renderTrigger,
}: {
  value: T | null;
  options: SelectOption<T>[];
  onValueChange: (value: T) => void;
  /** Accessible name and sheet title. */
  label: string;
  /** Shown while nothing is selected. */
  placeholder?: string;
  /** Placeholder of the search field on long lists. */
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * A custom trigger in place of the field (the web's SelectTrigger with its
   * own children, e.g. the code viewer's version picker). Gets the opener.
   */
  renderTrigger?: (open: () => void, current: SelectOption<T> | undefined) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.value === value);
  const isSearchable = options.length > SEARCH_THRESHOLD;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const close = (): void => {
    setIsOpen(false);
    setQuery("");
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setIsOpen(true), current)
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: current?.label ?? placeholder }}
          disabled={disabled}
          onPress={() => setIsOpen(true)}
          className={cn(fieldSelect.box, "flex-row items-center justify-between", disabled && "opacity-50", className)}
        >
          <Text className={cn(fieldSelect.text, !current && "text-faint")} numberOfLines={1}>
            {current?.label ?? placeholder ?? ""}
          </Text>
          <Icon name="chevron_down" size={16} color="muted-foreground" />
        </Pressable>
      )}
      <Sheet isOpen={isOpen} onClose={close} title={label}>
        {isSearchable ? (
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={input.placeholderColor}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={searchPlaceholder ?? label}
          />
        ) : null}
        <View className="max-h-96">
          <FlatList
            data={shown}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            renderItem={({ item: option }) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    onValueChange(option.value);
                    close();
                  }}
                  className={cn("min-h-11 flex-row items-center justify-between rounded-md px-2.5", isSelected && "bg-primary-soft")}
                >
                  <Text className={cn("text-sm", isSelected ? "font-semibold text-primary" : "font-medium text-ink-2")}>
                    {option.label}
                  </Text>
                  {isSelected ? <Icon name="check" size={16} stroke={2.4} color="primary" /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Sheet>
    </>
  );
}
