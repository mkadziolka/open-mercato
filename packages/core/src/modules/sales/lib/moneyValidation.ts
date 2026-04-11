export const SALES_MONEY_MAX_INTEGER_DIGITS = 14
export const SALES_MONEY_MAX_FRACTION_DIGITS = 4

export type SalesMoneyAmountValidationReason =
  | 'invalid_format'
  | 'not_finite'
  | 'negative'
  | 'too_many_integer_digits'
  | 'too_many_fraction_digits'

export type SalesMoneyAmountValidationResult =
  | { ok: true; numeric: number }
  | { ok: false; reason: SalesMoneyAmountValidationReason }

function normalizeSalesMoneyRawValue(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return String(value)
  }
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, '')
  return normalized.length ? normalized : null
}

export function validateSalesMoneyAmountInput(
  value: unknown,
): SalesMoneyAmountValidationResult {
  const raw = normalizeSalesMoneyRawValue(value)
  if (!raw) return { ok: false, reason: 'invalid_format' }
  if (raw.startsWith('-')) return { ok: false, reason: 'negative' }
  if (!/^\d+(?:\.\d+)?$/.test(raw)) {
    return { ok: false, reason: 'invalid_format' }
  }

  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) return { ok: false, reason: 'not_finite' }
  if (numeric < 0) return { ok: false, reason: 'negative' }

  const [integerPartRaw, fractionPart = ''] = raw.split('.')
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, '')
  if (integerPart.length > SALES_MONEY_MAX_INTEGER_DIGITS) {
    return { ok: false, reason: 'too_many_integer_digits' }
  }
  if (fractionPart.length > SALES_MONEY_MAX_FRACTION_DIGITS) {
    return { ok: false, reason: 'too_many_fraction_digits' }
  }

  return { ok: true, numeric }
}

export function roundSalesMoneyAmount(value: unknown): number | null {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length
        ? Number(value.trim())
        : Number.NaN
  if (!Number.isFinite(numeric) || numeric < 0) return null
  const factor = 10 ** SALES_MONEY_MAX_FRACTION_DIGITS
  const rounded = Math.round((numeric + Number.EPSILON) * factor) / factor
  const validation = validateSalesMoneyAmountInput(rounded)
  return validation.ok ? validation.numeric : null
}

export function isSalesMoneyAmountInputValid(value: unknown): boolean {
  return validateSalesMoneyAmountInput(value).ok
}

export type SalesLineComputedTotalValidationIssue = {
  path: 'totalNetAmount' | 'totalGrossAmount'
  message: string
}

export function getSalesLineComputedTotalValidationIssues(payload: {
  quantity?: number | null
  unitPriceNet?: number | null
  unitPriceGross?: number | null
}): SalesLineComputedTotalValidationIssue[] {
  const issues: SalesLineComputedTotalValidationIssue[] = []
  const quantity =
    typeof payload.quantity === 'number' ? payload.quantity : Number.NaN
  if (!Number.isFinite(quantity) || quantity < 0) return issues

  if (
    typeof payload.unitPriceNet === 'number' &&
    Number.isFinite(payload.unitPriceNet)
  ) {
    const totalNet = roundSalesMoneyAmount(quantity * payload.unitPriceNet)
    if (totalNet === null) {
      issues.push({
        path: 'totalNetAmount',
        message: getSalesMoneyAmountValidationMessage('Line total'),
      })
    }
  }

  if (
    typeof payload.unitPriceGross === 'number' &&
    Number.isFinite(payload.unitPriceGross)
  ) {
    const totalGross = roundSalesMoneyAmount(quantity * payload.unitPriceGross)
    if (totalGross === null) {
      issues.push({
        path: 'totalGrossAmount',
        message: getSalesMoneyAmountValidationMessage('Line total'),
      })
    }
  }

  return issues
}

export function getSalesMoneyAmountValidationMessage(label = 'Amount'): string {
  return `${label} must be a valid non-negative amount with at most ${SALES_MONEY_MAX_INTEGER_DIGITS} digits before the decimal point and ${SALES_MONEY_MAX_FRACTION_DIGITS} decimal places.`
}
