import { Text, YStack } from 'tamagui'

import { authorLines, type AuthorValue } from '@/features/cadastros/farmFilters'

/** Tamanho único do autor nas listas e detalhes do admin. */
export const AUTHOR_FONT_SIZE = 9

/**
 * Autor (só admin; quem chama decide): "Criado por: Nome" e "Email: e-mail", só as linhas que existirem, ou
 * "Autor não registrado". Uma linha cada, cortada com "…" para não quebrar o layout da lista.
 */
export function AuthorLines({ author }: { author: AuthorValue | string | null | undefined }) {
  return (
    <YStack>
      {authorLines(author).map((line) => (
        <Text key={line} fontSize={AUTHOR_FONT_SIZE} fontWeight="600" color="brandMuted" numberOfLines={1} ellipsizeMode="tail">
          {line}
        </Text>
      ))}
    </YStack>
  )
}
