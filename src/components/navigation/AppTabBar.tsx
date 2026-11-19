import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";

type TabIcon =
	| { family: "ion"; name: keyof typeof Ionicons.glyphMap }
	| { family: "mci"; name: keyof typeof MaterialCommunityIcons.glyphMap };

const ICONS: Record<string, { active: TabIcon; inactive: TabIcon }> = {
	index: {
		active: { family: "ion", name: "home" },
		inactive: { family: "ion", name: "home-outline" },
	},
	lancamentos: {
		active: { family: "mci", name: "needle" },
		inactive: { family: "mci", name: "needle" },
	},
	pesos: {
		active: { family: "mci", name: "scale" },
		inactive: { family: "mci", name: "scale" },
	},
	embarques: {
		active: { family: "mci", name: "truck-delivery" },
		inactive: { family: "mci", name: "truck-delivery-outline" },
	},
	configuracoes: {
		active: { family: "ion", name: "menu" },
		inactive: { family: "ion", name: "menu-outline" },
	},
};

const LABELS: Record<string, string> = {
	index: "Dashboard",
	lancamentos: "Medicamentos",
	pesos: "Peso",
	embarques: "Embarques",
	configuracoes: "Menu",
};

function TabBarIcon({
	icon,
	color,
}: {
	icon: TabIcon | undefined;
	color: string;
}) {
	if (icon?.family === "mci")
		return <MaterialCommunityIcons name={icon.name} size={24} color={color} />;
	return (
		<Ionicons
			name={icon?.family === "ion" ? icon.name : "ellipse"}
			size={24}
			color={color}
		/>
	);
}

const ACTIVE_LIGHT = "#2B3D34";
const ACTIVE_DARK = "#D1EFEF";
const PILL_LIGHT = "#E7F3EA";
const PILL_DARK = "#2C4A3E";
const INACTIVE_LIGHT = "#6E8076";
const INACTIVE_DARK = "#8FA399";
const BAR_LIGHT = "#FFFFFF";
const BAR_DARK = "#1C3C31";
const HAIRLINE_LIGHT = "#E4EEE6";
const HAIRLINE_DARK = "#2A4A3E";

type AppTabBarProps = Parameters<
	NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

export function AppTabBar({
	state,
	descriptors,
	emitter,
	navigateToTab,
	insets,
}: AppTabBarProps) {
	const isDark = useColorScheme() === "dark";
	const backgroundColor = isDark ? BAR_DARK : BAR_LIGHT;
	const inactive = isDark ? INACTIVE_DARK : INACTIVE_LIGHT;
	const active = isDark ? ACTIVE_DARK : ACTIVE_LIGHT;
	const pill = isDark ? PILL_DARK : PILL_LIGHT;
	const hairline = isDark ? HAIRLINE_DARK : HAIRLINE_LIGHT;

	return (
		<View
			style={[
				styles.bar,
				{
					backgroundColor,
					borderTopColor: hairline,
					paddingBottom: Math.max(insets.bottom, 6),
				},
			]}
			accessibilityRole="tablist"
		>
			<View style={styles.row}>
				{state.routes.map((route, index) => {
					const selected = state.index === index;
					const label =
						LABELS[route.name] ??
						descriptors[route.key].options.title ??
						route.name;
					const pair = ICONS[route.name];
					const icon = selected ? pair?.active : pair?.inactive;
					const tint = selected ? active : inactive;

					const onPress = () => {
							const event = emitter.emit({
								type: "tabPress",
								target: route.key,
								canPreventDefault: true,
							});
							if (!selected && !event.defaultPrevented) {
								navigateToTab(route.key);
							}
						};

						const onLongPress = () => {
							emitter.emit({ type: "tabLongPress", target: route.key });
						};

						return (
							<Pressable
								key={route.key}
								onPress={onPress}
								onLongPress={onLongPress}
								accessibilityRole="tab"
								accessibilityState={{ selected }}
								accessibilityLabel={label}
								hitSlop={4}
								style={styles.item}
							>
								<View style={styles.slot}>
									{selected ? (
										<View
											collapsable={false}
											style={[styles.pill, { backgroundColor: pill }]}
										/>
									) : null}
									<TabBarIcon icon={icon} color={tint} />
								</View>
								<Text
									style={[
										styles.label,
										{ color: tint, fontWeight: selected ? "700" : "500" },
									]}
									numberOfLines={1}
								>
									{label}
								</Text>
							</Pressable>
						);
					})}
				</View>
			</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	row: {
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-around",
		paddingTop: 8,
		paddingHorizontal: 8,
	},
	item: {
		flex: 1,
		alignItems: "center",
		justifyContent: "flex-end",
		minHeight: 52,
		gap: 3,
	},
	slot: {
		width: 64,
		height: 32,
		alignItems: "center",
		justifyContent: "center",
	},
	pill: {
		position: "absolute",
		width: 64,
		height: 32,
		borderRadius: 16,
	},
	label: {
		fontSize: 11,
		letterSpacing: 0.2,
	},
});
