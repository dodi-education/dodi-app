import { Fragment } from "react";
import { Pressable, View } from "react-native";
import { actionSheet } from "@dodi/ui-recipes";

import { Icon, type IconName, Sheet, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface GameAction {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  isDestructive?: boolean;
  /** Draws the menu separator above this item. */
  hasSeparatorBefore?: boolean;
}

/**
 * iOS can't present a modal while another is still animating out, so an
 * action that opens a dialog waits for the sheet's fade (Modal "fade").
 */
const SHEET_CLOSE_MS = 250;

/**
 * A row's "…" menu on a phone: the web's DropdownMenu items in the bottom
 * Sheet. Picking an item closes the sheet first, then runs the action.
 */
export function GameActionsSheet({
  title,
  actions,
  isOpen,
  onClose,
}: {
  title: string;
  actions: GameAction[];
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={title}>
      <View>
        {actions.map((action) => (
          <Fragment key={action.key}>
            {action.hasSeparatorBefore ? <View className={actionSheet.separator} /> : null}
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                onClose();
                setTimeout(action.onPress, SHEET_CLOSE_MS);
              }}
              className={cn(actionSheet.item, "active:bg-accent")}
            >
              <Icon name={action.icon} size={15} color={action.isDestructive ? "danger" : "muted-foreground"} />
              <Text className={cn(actionSheet.text, action.isDestructive && actionSheet.destructiveText)}>
                {action.label}
              </Text>
            </Pressable>
          </Fragment>
        ))}
      </View>
    </Sheet>
  );
}
