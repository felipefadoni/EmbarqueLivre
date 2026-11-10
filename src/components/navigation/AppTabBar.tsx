import Ionicons from '@expo/vector-icons/Ionicons'
import type { Tabs } from 'expo-router'
import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native'

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  infos: 'information-circle',
  configuracoes: 'menu',
}

const LABELS: Record<string, string> = {
  index: 'Dashboard',
  infos: 'Infos',
  configuracoes: 'Menu',
}

const ACTIVE_LIGHT = '#2B3D34'
const ACTIVE_DARK = '#99C2AB'
const ICON_ON_ACTIVE_LIGHT = '#FFFFFF'
const ICON_ON_ACTIVE_DARK = '#2B3D34'
const INACTIVE_LIGHT = '#7A8B80'
const INACTIVE_DARK = '#A8B8AF'
const BAR_LIGHT = '#FFFFFF'
const BAR_DARK = '#1C3C31'

type AppTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0]

export function AppTabBar({ state, descriptors, emitter, navigateToTab, insets }: AppTabBarProps) {
  const isDark = useColorScheme() === 'dark'
  const backgroundColor = isDark ? BAR_DARK : BAR_LIGHT
  const inactive = isDark ? INACTIVE_DARK : INACTIVE_LIGHT
  const activeBg = isDark ? ACTIVE_DARK : ACTIVE_LIGHT
  const activeIcon = isDark ? ICON_ON_ACTIVE_DARK : ICON_ON_ACTIVE_LIGHT
  const activeLabel = isDark ? ACTIVE_DARK : ACTIVE_LIGHT

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor,
          paddingBottom: Math.max(insets.bottom, 8),
          shadowOpacity: isDark ? 0.4 : 0.12,
        },
      ]}
      accessibilityRole="tablist">
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const selected = state.index === index
          const label = LABELS[route.name] ?? descriptors[route.key].options.title ?? route.name
          const iconName = ICONS[route.name] ?? 'ellipse'
          const iconColor = selected ? activeIcon : inactive

          const onPress = () => {
            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (!selected && !event.defaultPrevented) {
              navigateToTab(route.key)
            }
          }

          const onLongPress = () => {
            emitter.emit({ type: 'tabLongPress', target: route.key })
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              hitSlop={4}
              style={styles.item}>
              <View style={[styles.iconWrap, selected && { backgroundColor: activeBg }]}>
                <Ionicons name={iconName} size={22} color={iconColor} />
              </View>
              <Text style={[styles.label, { color: selected ? activeLabel : inactive }]}>{label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#1C3C31',
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 10,
    minHeight: 56,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    gap: 4,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
})
