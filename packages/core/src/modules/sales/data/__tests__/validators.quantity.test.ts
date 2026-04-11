import {
  quoteLineCreateSchema,
  orderLineCreateSchema,
  shipmentCreateSchema,
  invoiceCreateSchema,
  creditMemoCreateSchema,
} from '../validators'
import { getSalesLineComputedTotalValidationIssues } from '../../lib/moneyValidation'

const MAX_QUANTITY = 999_999_999

const SCOPE = {
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}

const UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function expectQuantityError(result: { success: false; error: { issues: { message: string }[] } }) {
  const messages = result.error.issues.map((i) => i.message)
  expect(messages).toContain('Quantity is too large.')
}

function expectMoneyError(result: { success: false; error: { issues: { message: string }[] } }) {
  const messages = result.error.issues.map((i) => i.message)
  expect(messages.some((message) => message.includes('decimal point'))).toBe(true)
}

// ---------------------------------------------------------------------------
// quoteLineCreateSchema
// ---------------------------------------------------------------------------

describe('quoteLineCreateSchema — quantity validation', () => {
  const base = {
    ...SCOPE,
    quoteId: UUID,
    currencyCode: 'USD',
  }

  it('accepts quantity = 0', () => {
    const result = quoteLineCreateSchema.safeParse({ ...base, quantity: 0 })
    expect(result.success).toBe(true)
  })

  it('accepts quantity = MAX_QUANTITY', () => {
    const result = quoteLineCreateSchema.safeParse({ ...base, quantity: MAX_QUANTITY })
    expect(result.success).toBe(true)
  })

  it('rejects quantity = MAX_QUANTITY + 1', () => {
    const result = quoteLineCreateSchema.safeParse({ ...base, quantity: MAX_QUANTITY + 1 })
    expect(result.success).toBe(false)
    if (!result.success) expectQuantityError(result)
  })

  it('rejects negative quantity', () => {
    const result = quoteLineCreateSchema.safeParse({ ...base, quantity: -1 })
    expect(result.success).toBe(false)
  })

  it('accepts normalizedQuantity = MAX_QUANTITY', () => {
    const result = quoteLineCreateSchema.safeParse({ ...base, quantity: 1, normalizedQuantity: MAX_QUANTITY })
    expect(result.success).toBe(true)
  })

  it('rejects normalizedQuantity = MAX_QUANTITY + 1', () => {
    const result = quoteLineCreateSchema.safeParse({ ...base, quantity: 1, normalizedQuantity: MAX_QUANTITY + 1 })
    expect(result.success).toBe(false)
    if (!result.success) expectQuantityError(result)
  })

  it('rejects unitPriceNet that exceeds numeric(18,4) integer precision', () => {
    const result = quoteLineCreateSchema.safeParse({
      ...base,
      quantity: 1,
      unitPriceNet: 100_000_000_000_000,
    })
    expect(result.success).toBe(false)
    if (!result.success) expectMoneyError(result)
  })

  it('rejects unitPriceNet with more than 4 decimal places', () => {
    const result = quoteLineCreateSchema.safeParse({
      ...base,
      quantity: 1,
      unitPriceNet: '12.34567',
    })
    expect(result.success).toBe(false)
    if (!result.success) expectMoneyError(result)
  })

  it('flags a computed total that exceeds numeric(18,4)', () => {
    const issues = getSalesLineComputedTotalValidationIssues({
      quantity: MAX_QUANTITY,
      unitPriceNet: 1_000_000,
    })
    expect(issues).toEqual([
      expect.objectContaining({
        path: 'totalNetAmount',
      }),
    ])
  })
})

// ---------------------------------------------------------------------------
// orderLineCreateSchema
// ---------------------------------------------------------------------------

describe('orderLineCreateSchema — quantity validation', () => {
  const base = {
    ...SCOPE,
    orderId: UUID,
    currencyCode: 'USD',
  }

  it('accepts quantity = MAX_QUANTITY', () => {
    const result = orderLineCreateSchema.safeParse({ ...base, quantity: MAX_QUANTITY })
    expect(result.success).toBe(true)
  })

  it('rejects quantity = MAX_QUANTITY + 1', () => {
    const result = orderLineCreateSchema.safeParse({ ...base, quantity: MAX_QUANTITY + 1 })
    expect(result.success).toBe(false)
    if (!result.success) expectQuantityError(result)
  })

  it('rejects unitPriceGross that exceeds numeric(18,4) integer precision', () => {
    const result = orderLineCreateSchema.safeParse({
      ...base,
      quantity: 1,
      unitPriceGross: 100_000_000_000_000,
    })
    expect(result.success).toBe(false)
    if (!result.success) expectMoneyError(result)
  })

  it('flags a computed gross total that exceeds numeric(18,4)', () => {
    const issues = getSalesLineComputedTotalValidationIssues({
      quantity: MAX_QUANTITY,
      unitPriceGross: 1_000_000,
    })
    expect(issues).toEqual([
      expect.objectContaining({
        path: 'totalGrossAmount',
      }),
    ])
  })
})

// ---------------------------------------------------------------------------
// shipmentCreateSchema — items quantity
// ---------------------------------------------------------------------------

describe('shipmentCreateSchema — items quantity validation', () => {
  const base = {
    ...SCOPE,
    orderId: UUID,
  }

  it('accepts item quantity = MAX_QUANTITY', () => {
    const result = shipmentCreateSchema.safeParse({
      ...base,
      items: [{ orderLineId: UUID, quantity: MAX_QUANTITY }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects item quantity = MAX_QUANTITY + 1', () => {
    const result = shipmentCreateSchema.safeParse({
      ...base,
      items: [{ orderLineId: UUID, quantity: MAX_QUANTITY + 1 }],
    })
    expect(result.success).toBe(false)
    if (!result.success) expectQuantityError(result)
  })
})

// ---------------------------------------------------------------------------
// invoiceCreateSchema — lines quantity
// ---------------------------------------------------------------------------

describe('invoiceCreateSchema — lines quantity validation', () => {
  const base = {
    ...SCOPE,
    invoiceNumber: 'INV-001',
    currencyCode: 'USD',
  }

  it('accepts line quantity = MAX_QUANTITY', () => {
    const result = invoiceCreateSchema.safeParse({
      ...base,
      lines: [{ quantity: MAX_QUANTITY, currencyCode: 'USD' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects line quantity = MAX_QUANTITY + 1', () => {
    const result = invoiceCreateSchema.safeParse({
      ...base,
      lines: [{ quantity: MAX_QUANTITY + 1, currencyCode: 'USD' }],
    })
    expect(result.success).toBe(false)
    if (!result.success) expectQuantityError(result)
  })
})

// ---------------------------------------------------------------------------
// creditMemoCreateSchema — lines quantity
// ---------------------------------------------------------------------------

describe('creditMemoCreateSchema — lines quantity validation', () => {
  const base = {
    ...SCOPE,
    creditMemoNumber: 'CM-001',
    currencyCode: 'USD',
  }

  it('accepts line quantity = MAX_QUANTITY', () => {
    const result = creditMemoCreateSchema.safeParse({
      ...base,
      lines: [{ quantity: MAX_QUANTITY, currencyCode: 'USD' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects line quantity = MAX_QUANTITY + 1', () => {
    const result = creditMemoCreateSchema.safeParse({
      ...base,
      lines: [{ quantity: MAX_QUANTITY + 1, currencyCode: 'USD' }],
    })
    expect(result.success).toBe(false)
    if (!result.success) expectQuantityError(result)
  })
})
