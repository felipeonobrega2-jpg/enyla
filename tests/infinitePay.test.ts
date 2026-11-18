import { describe, it, expect } from "vitest"
import { orderNsu, numeroDoOrderNsu } from "@/app/lib/infinitePay"

describe("InfinitePay", () => {
  it("o order_nsu leva o número do orçamento e volta a ele", () => {
    const n = orderNsu("ORC-2026-231")
    expect(n).toMatch(/^ORC-2026-231_[a-z0-9]+$/)
    expect(numeroDoOrderNsu(n)).toBe("ORC-2026-231")
    expect(numeroDoOrderNsu("qualquer")).toBeNull()
  })
})
