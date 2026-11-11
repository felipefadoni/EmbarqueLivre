/**
 * Textos e regras de tela do fluxo de embarque (status, adicionar animal, finalizar, excluir). Puro, testável no Node.
 * Contrato final: SHIPMENT_FLOW_CONTRACT (carência é só aviso).
 */
import { SHIPMENT_STATUS_LABEL, type ShipmentStatus } from '@/api/shipmentsContract'
import { formatDatePtBr } from '@/features/cadastros/dates'

export const SHIPMENT_TABS: { value: ShipmentStatus; label: string }[] = [
  { value: 'in_progress', label: SHIPMENT_STATUS_LABEL.in_progress },
  { value: 'finished', label: SHIPMENT_STATUS_LABEL.finished },
]

/** Só Em andamento aceita edição (nome, data, animais, peso, foto). Finalizado é só leitura. */
export function isShipmentEditable(status: ShipmentStatus | null | undefined): boolean {
  return (status ?? 'in_progress') === 'in_progress'
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)

/** Aviso antes de adicionar animal em carência no dia do embarque (não bloqueia: o app pede confirmação). */
export function withdrawalConfirmMessage(code: string, freeAt: string | null, shippedOn: string): string {
  const free = freeAt ? ` Ele fica livre em ${formatDatePtBr(freeAt)}.` : ''
  return `O animal ${code || 'selecionado'} estará em carência no dia do embarque (${formatDatePtBr(shippedOn)}).${free} Confirme se quer adicioná-lo mesmo assim.`
}

/** Aviso quando a nova data deixa animais do embarque em carência (só aviso: não bloqueia). */
export function dateChangeWithdrawalMessage(count: number, shippedOn: string): string {
  const who = count === 1 ? '1 animal deste embarque estará em carência' : `${count} animais deste embarque estarão em carência`
  return `${who} em ${formatDatePtBr(shippedOn)}.`
}

export function finishConfirmMessage(count: number): string {
  return `${plural(count, 'animal sai', 'animais saem')} da lista de Animais cadastrados. Depois de finalizado, o embarque não pode mais ser editado (nem nome, data ou animais).`
}

export function deleteConfirmMessage(status: ShipmentStatus, count: number): string {
  if (status === 'finished') {
    return `O embarque finalizado será excluído. ${count ? `${plural(count, 'animal continua', 'animais continuam')} fora da lista de cadastrados (já saíram da fazenda).` : ''} Esta ação não pode ser desfeita.`.replace(/\s+/g, ' ')
  }
  return count
    ? `${plural(count, 'animal sai', 'animais saem')} do embarque e ${count === 1 ? 'continua cadastrado' : 'continuam cadastrados'} na fazenda. Esta ação não pode ser desfeita.`
    : 'Esta ação não pode ser desfeita.'
}

export function animalsCountLabel(count: number): string {
  return plural(count, 'animal', 'animais')
}
