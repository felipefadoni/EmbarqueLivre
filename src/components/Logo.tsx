import { Image } from 'expo-image'

/**
 * Placeholder da marca. Para trocar a logo, substitua o arquivo
 * `assets/images/logo-placeholder.png` — este componente não precisa mudar.
 */
const logoSource = require('@/assets/images/logo-placeholder.png')

type LogoProps = {
  size?: number
}

export function Logo({ size = 128 }: LogoProps) {
  return (
    <Image
      source={logoSource}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="Embarque Livre"
      accessibilityRole="image"
    />
  )
}
