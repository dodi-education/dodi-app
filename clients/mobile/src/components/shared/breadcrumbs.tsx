import { type Href, Link, usePathname, useRouter } from "expo-router";
import { Fragment } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { activeKidId, buildCrumbs } from "@dodi/client-state/breadcrumbs";
import type { Kid } from "@dodi/types/database";
import { kidCrumbSwitcher, breadcrumbs as styles } from "@dodi/ui-recipes";

import { Icon, Select, Text } from "@/components/ui";
import { useBreadcrumbStore } from "@/lib/breadcrumb-store";
import { cn } from "@/lib/cn";
import { useKids } from "@/lib/use-kids";

/**
 * The page title, as on the web's phone top bar: the trail for the current
 * route (shared builder), earlier crumbs as links, the last one bold. On a
 * kid's pages the kid crumb carries the switcher.
 */
export function Breadcrumbs() {
  const t = useTranslations();
  const pathname = usePathname();
  const leaf = useBreadcrumbStore((s) => s.leaf);
  const { kids } = useKids();
  const kidId = activeKidId(pathname);
  const kidName = kidId ? (kids?.find((k) => k.id === kidId)?.display_name ?? null) : null;
  const crumbs = buildCrumbs(pathname, (key) => t(key), { kidName, leafOverride: leaf });

  return (
    <View className={styles.row} accessibilityRole="header">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 ? (
              <Icon name="chevron_right" size={styles.separatorIcon.size} color="faint" />
            ) : null}
            {isLast || !crumb.href ? (
              <Text
                numberOfLines={1}
                className={cn(styles.text, isLast ? styles.current : styles.link, "shrink")}
              >
                {crumb.label}
              </Text>
            ) : (
              <Link href={crumb.href as Href} asChild>
                <Pressable accessibilityRole="link" className="shrink">
                  <Text numberOfLines={1} className={cn(styles.text, styles.link)}>
                    {crumb.label}
                  </Text>
                </Pressable>
              </Link>
            )}
            {crumb.isKidCrumb && kidId && kids && kids.length > 0 ? (
              <KidSwitcher kids={kids} activeId={kidId} pathname={pathname} />
            ) : null}
          </Fragment>
        );
      })}
    </View>
  );
}

/**
 * Swaps the kid id in the current path, keeping the sub-route (so
 * `…/{id}/memory` stays on memory). The web's popover menu opens as the
 * kit's bottom Sheet here.
 */
function KidSwitcher({ kids, activeId, pathname }: { kids: Kid[]; activeId: string; pathname: string }) {
  const t = useTranslations("nav");
  const router = useRouter();
  return (
    <Select
      value={activeId}
      label={t("switchKid")}
      options={kids.map((k) => ({ value: k.id, label: k.display_name }))}
      onValueChange={(id) => {
        if (id === activeId) return;
        router.push(pathname.replace(/(\/parent\/kids\/)[^/]+/, `$1${id}`) as Href);
      }}
      renderTrigger={(open) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("switchKid")}
          hitSlop={8}
          onPress={open}
          className={cn(kidCrumbSwitcher.button, kidCrumbSwitcher.shrink, "active:bg-foreground/5")}
        >
          <Icon name="switch_vertical" size={16} color="muted-foreground" />
        </Pressable>
      )}
    />
  );
}
