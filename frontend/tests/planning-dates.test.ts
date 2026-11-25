import { expect, test } from "bun:test"

import { timeRangesOverlap } from "../src/features/planning/dates"

test("una clase puede comenzar justo al terminar otra", () => {
  expect(timeRangesOverlap("08:00", "10:00", "10:00:00", "12:00:00")).toBe(false)
  expect(timeRangesOverlap("10:00", "12:00", "08:00:00", "10:00:00")).toBe(false)
})

test("se detecta ocupación cuando las franjas se superponen", () => {
  expect(timeRangesOverlap("08:00", "10:00", "09:00:00", "11:00:00")).toBe(true)
  expect(timeRangesOverlap("08:00", "10:00", "08:00:00", "10:00:00")).toBe(true)
  expect(timeRangesOverlap("08:00", "10:00", "11:00:00", "12:00:00")).toBe(false)
})
