/**
 * Relatório "Exportar Dados" do embarque finalizado (PDF). Puro (testável no Node): regras de quem exporta,
 * totais (kg e arroba), cabeçalho de rebanhos, nome do arquivo e o HTML impresso pelo expo-print.
 */
import type { UserRole } from '@/api/types'
import { canExportShipments } from '@/features/cadastros/permissions'
import { formatDatePtBr } from '@/components/form/date'

/** 1 arroba = 15 kg (padrão pecuário no Brasil). */
export const KG_PER_ARROBA = 15
export const NO_HERD_LABEL = 'Sem rebanho'

export type ShipmentReportAnimal = {
  code: string | null
  weightKg: number | null
  herdName: string | null
  /** data:image/jpeg;base64,... já pronta; null = foto indisponível (placeholder na célula). */
  photoDataUri: string | null
}

export type ShipmentReportData = {
  shipmentName: string
  farmName: string | null
  shippedOn: string | null
  animals: ShipmentReportAnimal[]
  /** Quando o PDF foi gerado (texto do rodapé). */
  generatedAt?: Date
}

/** Só master/admin e só embarque finalizado. */
export function canExportShipment(role: UserRole | null | undefined, status: string | null | undefined): boolean {
  return canExportShipments(role) && status === 'finished'
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function formatDecimal(value: number, decimals: number): string {
  const fixed = (Math.round(value * 10 ** decimals) / 10 ** decimals).toFixed(decimals)
  const negative = fixed.startsWith('-')
  const [int, frac] = (negative ? fixed.slice(1) : fixed).split('.')
  return `${negative ? '-' : ''}${groupThousands(int)}${frac ? `,${frac}` : ''}`
}

/** 452.5 → "452,5 kg"; 450 → "450,0 kg"; 12345.5 → "12.345,5 kg". */
export function formatReportKg(value: number): string {
  return `${formatDecimal(value, 1)} kg`
}

/** 187.5 kg → "12,50 @". */
export function formatArroba(arrobas: number): string {
  return `${formatDecimal(arrobas, 2)} @`
}

/** Soma em décimos (evita 0,1 + 0,2 = 0,30000000000000004). Peso ausente conta 0. */
export function totalWeightKg(animals: Pick<ShipmentReportAnimal, 'weightKg'>[]): number {
  const tenths = animals.reduce((sum, a) => sum + (Number.isFinite(a.weightKg as number) ? Math.round((a.weightKg as number) * 10) : 0), 0)
  return tenths / 10
}

export function toArrobas(kg: number): number {
  return kg / KG_PER_ARROBA
}

/** Nomes distintos de rebanho (animal sem rebanho = "Sem rebanho"), em ordem alfabética, "Sem rebanho" por último. */
export function herdNames(animals: Pick<ShipmentReportAnimal, 'herdName'>[]): string[] {
  const named = new Map<string, string>()
  let withoutHerd = false
  for (const a of animals) {
    const name = a.herdName?.trim()
    if (!name) withoutHerd = true
    else if (!named.has(name.toLocaleLowerCase('pt-BR'))) named.set(name.toLocaleLowerCase('pt-BR'), name)
  }
  const list = [...named.values()].sort((x, y) => x.localeCompare(y, 'pt-BR', { sensitivity: 'base' }))
  return withoutHerd ? [...list, NO_HERD_LABEL] : list
}

/** "Rebanho: A" (um só) ou "Rebanhos: A, B" (mais de um). Sem animais: "Rebanho: —". */
export function herdHeaderLine(animals: Pick<ShipmentReportAnimal, 'herdName'>[]): string {
  const names = herdNames(animals)
  if (!names.length) return 'Rebanho: —'
  return names.length === 1 ? `Rebanho: ${names[0]}` : `Rebanhos: ${names.join(', ')}`
}

/** Ordem estável por código (sem diferenciar maiúsculas; números em ordem natural). */
export function sortReportAnimals<T extends { code: string | null }>(animals: T[]): T[] {
  return animals
    .map((a, index) => ({ a, index }))
    .sort((x, y) => (x.a.code ?? '').localeCompare(y.a.code ?? '', 'pt-BR', { sensitivity: 'base', numeric: true }) || x.index - y.index)
    .map(({ a }) => a)
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** embarque-{nome}-{DD-MM-AAAA}.pdf (sem acentos, espaços ou barras). */
export function reportFileName(shipmentName: string, shippedOn: string | null | undefined): string {
  const name = slug(shipmentName) || 'sem-nome'
  const iso = String(shippedOn ?? '').slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('-') : ''
  return `embarque-${name}${date ? `-${date}` : ''}.pdf`
}

export function escapeHtml(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** "10/11/2026 às 22:34" no fuso do aparelho. */
export function formatGeneratedAt(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} às ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Só aceita data URI de imagem (nada de URL externa no PDF). */
function safePhoto(uri: string | null): string | null {
  return uri && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(uri) ? uri : null
}

/** HTML A4 (retrato) do relatório. Paleta do app; legível impresso. */
export function buildShipmentReportHtml(data: ShipmentReportData): string {
  const animals = sortReportAnimals(data.animals)
  const totalKg = totalWeightKg(animals)
  const rows = animals
    .map((a) => {
      const photo = safePhoto(a.photoDataUri)
      const cell = photo
        ? `<img class="photo" src="${photo}" alt="Foto do animal ${escapeHtml(a.code)}" />`
        : `<div class="photo placeholder">Foto indisponível</div>`
      const weight = Number.isFinite(a.weightKg as number) ? formatReportKg(a.weightKg as number) : '—'
      return `<tr><td class="c-photo">${cell}</td><td class="c-code">${escapeHtml(a.code) || '—'}</td><td class="c-weight">${weight}</td></tr>`
    })
    .join('\n')
  const generated = data.generatedAt ? `<p class="generated">Gerado em ${formatGeneratedAt(data.generatedAt)} pelo Embarque Livre.</p>` : ''
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(data.shipmentName)}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Roboto, Arial, sans-serif; color: #2B3D34; margin: 0; font-size: 12pt; }
  header { border-bottom: 3px solid #99C2AB; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 20pt; margin: 0 0 6px; }
  .meta { margin: 2px 0; font-size: 12pt; }
  .meta strong { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #CEE3CD; text-align: left; padding: 8px; font-size: 11pt; border-bottom: 2px solid #99C2AB; }
  td { padding: 6px 8px; border-bottom: 1px solid #CEE3CD; vertical-align: middle; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #F4FAFA; }
  .c-photo { width: 104px; }
  .photo { width: 92px; height: 92px; object-fit: cover; border-radius: 8px; border: 1px solid #99C2AB; display: block; }
  .placeholder { background: #D1EFEF; color: #2B3D34; font-size: 8.5pt; display: flex; align-items: center; justify-content: center; text-align: center; padding: 4px; }
  .c-code { font-weight: 700; font-size: 13pt; }
  .c-weight, th.c-weight { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  footer { margin-top: 16px; border-top: 3px solid #99C2AB; padding-top: 10px; page-break-inside: avoid; }
  .totals { width: 100%; }
  .totals td { border: none; padding: 4px 0; font-size: 13pt; }
  .totals .value { text-align: right; font-weight: 800; }
  .generated { color: #3A5247; font-size: 9pt; margin-top: 10px; }
</style>
</head>
<body>
<header>
  <h1>Relatório do embarque</h1>
  <p class="meta"><strong>Fazenda:</strong> ${escapeHtml(data.farmName) || '—'}</p>
  <p class="meta"><strong>${escapeHtml(herdHeaderLine(animals))}</strong></p>
  <p class="meta"><strong>Embarque:</strong> ${escapeHtml(data.shipmentName)}</p>
  <p class="meta"><strong>Data do embarque:</strong> ${data.shippedOn ? formatDatePtBr(String(data.shippedOn).slice(0, 10)) : '—'}</p>
</header>
<table>
  <thead><tr><th class="c-photo">Foto</th><th>Código (brinco)</th><th class="c-weight">Peso (kg)</th></tr></thead>
  <tbody>
${rows || '<tr><td colspan="3">Nenhum animal neste embarque.</td></tr>'}
  </tbody>
</table>
<footer>
  <table class="totals">
    <tr><td>Animais</td><td class="value">${animals.length}</td></tr>
    <tr><td>Total em peso</td><td class="value">${formatReportKg(totalKg)}</td></tr>
    <tr><td>Total em arroba (1 @ = ${KG_PER_ARROBA} kg)</td><td class="value">${formatArroba(toArrobas(totalKg))}</td></tr>
  </table>
  ${generated}
</footer>
</body>
</html>`
}
