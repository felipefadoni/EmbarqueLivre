import { Text, XStack } from 'tamagui'

import type { UserRole } from '@/api/types'
import { ROLE_LABELS } from '@/features/usuarios/rules'

/** Selo do perfil (Usuário Master / Usuário Basic), marcador "você" e, se houver, a situação (discreta). */
export function RoleBadge({ role, self = false, status = null }: { role: UserRole; self?: boolean; status?: string | null }) {
  const strong = role === 'master' || role === 'admin'
  return (
    <XStack gap={6} items="center" flexWrap="wrap">
      <XStack
        px={10}
        py={4}
        rounded={999}
        bg={strong ? 'brandPrimary' : 'brandSurface'}
        borderWidth={strong ? 0 : 2}
        borderColor="brandBorder">
        <Text fontSize={13} fontWeight="800" color={strong ? 'brandPrimaryFg' : 'brandFg'}>
          {ROLE_LABELS[role]}
        </Text>
      </XStack>
      {self ? (
        <XStack px={10} py={4} rounded={999} borderWidth={2} borderColor="brandBorder">
          <Text fontSize={13} fontWeight="800" color="brandMuted">
            você
          </Text>
        </XStack>
      ) : null}
      {status ? (
        <Text fontSize={13} fontWeight="700" color="brandMuted" accessibilityLabel={`Situação: ${status}`}>
          · {status}
        </Text>
      ) : null}
    </XStack>
  )
}
