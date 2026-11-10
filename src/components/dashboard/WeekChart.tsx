import { useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg'
import { Text, XStack, YStack } from 'tamagui'

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

type WeekChartProps = {
  values: readonly number[]
  color: string
  gridColor: string
  labelColor: string
  fillColor: string
  labels?: readonly string[]
}

export function WeekChart({ values, color, gridColor, labelColor, fillColor, labels = DIAS }: WeekChartProps) {
  const [width, setWidth] = useState(0)
  const height = 148
  const padX = 8
  const padY = 16
  const max = Math.max(...values, 1)

  function onLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width)
  }

  const innerW = Math.max(width - padX * 2, 0)
  const innerH = height - padY * 2
  const lastIndex = Math.max(values.length - 1, 1)
  const points = values.map((value, index) => {
    const x = padX + (index / lastIndex) * innerW
    const y = padY + innerH - (value / max) * innerH
    return { x, y }
  })
  const pointsAttr = points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaPath =
    points.length === 0
      ? ''
      : `M ${points[0].x} ${padY + innerH} L ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${points[points.length - 1].x} ${padY + innerH} Z`

  return (
    <YStack w="100%" onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[0, 0.5, 1].map((tick) => {
            const y = padY + innerH * (1 - tick)
            return (
              <Line
                key={tick}
                x1={padX}
                y1={y}
                x2={width - padX}
                y2={y}
                stroke={gridColor}
                strokeWidth={1}
              />
            )
          })}
          <Path d={areaPath} fill={fillColor} />
          <Polyline
            points={pointsAttr}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((point, index) => (
            <Circle key={index} cx={point.x} cy={point.y} r={5} fill={color} />
          ))}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      <XStack justify="space-between" px={padX}>
        {labels.map((label) => (
          <Text key={label} fontSize={13} fontWeight="700" style={{ color: labelColor }}>
            {label}
          </Text>
        ))}
      </XStack>
    </YStack>
  )
}
