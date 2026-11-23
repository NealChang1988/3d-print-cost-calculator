import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculate,
  currencyChoice,
  detectCurrency,
  formatMoney,
  parseLooseNumber,
  parseTime,
  plainText,
  quantityNote,
  retainCurrencyNote,
} from "../src/calc.js";
import { DISCLAIMER } from "../src/copy.js";

function exampleA(overrides = {}) {
  return {
    mode: "filament",
    currency: "USD",
    materialPrice: "22.99",
    packageAmount: "1",
    packageUnit: "kg",
    usageAmount: "87.4",
    usageUnit: "g",
    wasteAmount: "",
    timeText: "5h 23m",
    power: "120",
    electricity: "0.16",
    laborMinutes: "15",
    hourlyRate: "20",
    depreciationOn: false,
    machinePrice: "",
    machineHours: "",
    otherCosts: "",
    failureRate: "0",
    priceMethod: "markup",
    pricePercent: "50",
    partName: "",
    ...overrides,
  };
}

function money(result) {
  assert.equal(result.ok, true, result.errors && result.errors.join("; "));
  const byId = Object.fromEntries(result.lines.map((line) => [line.id, line.cents]));
  return {
    material: formatMoney(byId.material, result.currency),
    electricity: formatMoney(byId.electricity, result.currency),
    labor: byId.labor == null ? null : formatMoney(byId.labor, result.currency),
    wear: byId.wear == null ? null : formatMoney(byId.wear, result.currency),
    success: formatMoney(result.successCents, result.currency),
    price: formatMoney(result.priceCents, result.currency),
    failure: result.failureShareCents == null ? null : formatMoney(result.failureShareCents, result.currency),
    subtotal: formatMoney(result.subtotalCents, result.currency),
  };
}

test("example A matches $2.01, $0.10, $5.00, $7.11, $10.67", () => {
  const got = money(calculate(exampleA()));
  assert.deepEqual(got, {
    material: "$2.01",
    electricity: "$0.10",
    labor: "$5.00",
    wear: null,
    success: "$7.11",
    price: "$10.67",
    failure: null,
    subtotal: "$7.11",
  });
  const result = calculate(exampleA());
  assert.match(result.successFormula, /2\.01 \+ 0\.10 \+ 5\.00 = 7\.11/);
  assert.match(result.priceFormula, /7\.11 × \(1 \+ 50\/100\) = 10\.67/);
  assert.match(result.priceSentence, /markup, not margin/);
  assert.equal(result.priceSentence.includes("margin, not markup"), false);
  const labor = result.lines.find((line) => line.id === "labor");
  assert.equal(labor.formula, "(15 ÷ 60) × 20 = 5.00");
  const text = plainText(result, "3D Print Cost Calculator");
  assert.match(text, /\$10\.67/);
  assert.ok(text.includes(DISCLAIMER));
  assert.equal(text.includes("NaN"), false);
  assert.equal(text.includes("Infinity"), false);
});

test("example A time 5:23 and 323 min match 5h 23m", () => {
  const base = money(calculate(exampleA()));
  for (const timeText of ["5:23", "323 min", "323m", "5h23m", "5H 23M", "5 hours 23 minutes", "5 hr 23 min", "  5h   23m  "]) {
    assert.deepEqual(money(calculate(exampleA({ timeText }))), base, timeText);
  }
});

test("example A currency TWD changes the symbol only", () => {
  const usd = calculate(exampleA());
  const twd = calculate(exampleA({ currency: "TWD" }));
  assert.equal(twd.successCents, usd.successCents);
  assert.equal(twd.priceCents, usd.priceCents);
  assert.equal(formatMoney(twd.lines[0].cents, "TWD"), "NT$2.01");
  assert.equal(formatMoney(twd.priceCents, "TWD"), "NT$10.67");
  assert.equal(formatMoney(twd.successCents, "TWD"), "NT$7.11");
});

test("example B matches $0.43, $7.54, $0.40, $7.94, $13.23", () => {
  const result = calculate(exampleA({
    depreciationOn: true,
    machinePrice: "399",
    machineHours: "5,000",
    failureRate: "5",
    priceMethod: "margin",
    pricePercent: "40",
  }));
  const got = money(result);
  assert.equal(got.material, "$2.01");
  assert.equal(got.electricity, "$0.10");
  assert.equal(got.labor, "$5.00");
  assert.equal(got.wear, "$0.43");
  assert.equal(got.subtotal, "$7.54");
  assert.equal(got.failure, "$0.40");
  assert.equal(got.success, "$7.94");
  assert.equal(got.price, "$13.23");
  assert.match(result.priceSentence, /margin, not markup/);
  assert.match(result.priceFormula, /7\.94 ÷ \(1 − 40\/100\) = 13\.23/);
});

test("example C matches $0.46, $0.07, $0.53, $1.06", () => {
  const got = money(calculate(exampleA({
    materialPrice: "18.50",
    usageAmount: "24.6",
    timeText: "2h 10m",
    power: "150",
    electricity: "0.22",
    laborMinutes: "",
    hourlyRate: "",
    pricePercent: "100",
  })));
  assert.equal(got.material, "$0.46");
  assert.equal(got.electricity, "$0.07");
  assert.equal(got.labor, null);
  assert.equal(got.success, "$0.53");
  assert.equal(got.price, "$1.06");
});

test("example D resin matches $1.50, $0.04, $1.54, $2.31", () => {
  const got = money(calculate(exampleA({
    mode: "resin",
    materialPrice: "39.00",
    packageAmount: "1",
    packageUnit: "L",
    usageAmount: "38.5",
    usageUnit: "ml",
    timeText: "4h 05m",
    power: "60",
    electricity: "0.16",
    laborMinutes: "",
    hourlyRate: "",
  })));
  assert.equal(got.material, "$1.50");
  assert.equal(got.electricity, "$0.04");
  assert.equal(got.success, "$1.54");
  assert.equal(got.price, "$2.31");
});

test("example E waste matches material $2.29", () => {
  const result = calculate(exampleA({ wasteAmount: "12" }));
  const material = result.lines.find((line) => line.id === "material");
  assert.equal(formatMoney(material.cents, "USD"), "$2.29");
});

test("87,4 matches 87.4 and symbols and thousands parse", () => {
  const dotted = calculate(exampleA());
  const comma = calculate(exampleA({ usageAmount: "87,4 g" }));
  assert.equal(comma.lines[0].cents, dotted.lines[0].cents);
  const symbol = calculate(exampleA({ materialPrice: "$22.99" }));
  assert.equal(symbol.lines[0].cents, dotted.lines[0].cents);
  assert.equal(parseLooseNumber("NT$590").value, 590);
  assert.equal(parseLooseNumber("£17.50").value, 17.5);
  assert.equal(parseLooseNumber("1,000").value, 1000);
  assert.equal(parseLooseNumber("1,000.50").value, 1000.5);
  assert.equal(parseLooseNumber("87,4").value, 87.4);
  const thousand = calculate(exampleA({ packageAmount: "1,000", packageUnit: "g" }));
  assert.equal(thousand.lines[0].cents, dotted.lines[0].cents);
  const misread = calculate(exampleA({ packageAmount: "1", packageUnit: "g", usageAmount: "87.4" }));
  assert.notEqual(misread.lines[0].cents, dotted.lines[0].cents);
});

test("bad inputs explain the next fix and never return NaN or Infinity", () => {
  const cases = [
    [exampleA({ timeText: "abc" }), /time like 5h 23m/i],
    [exampleA({ usageAmount: "" }), /Print weight/],
    [exampleA({ packageAmount: "0" }), /more than 0/],
    [exampleA({ failureRate: "100" }), /0 to 80/],
    [exampleA({ priceMethod: "margin", pricePercent: "100" }), /0 to 90/],
    [exampleA({ electricity: "-1" }), /cannot be negative/],
  ];
  for (const [input, pattern] of cases) {
    const result = calculate(input);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), pattern);
    const blob = JSON.stringify(result);
    assert.equal(blob.includes("NaN"), false);
    assert.equal(blob.includes("Infinity"), false);
  }
});

test("limits from the spec reject out-of-range values", () => {
  assert.equal(calculate(exampleA({ timeText: "240h" })).ok, true);
  assert.equal(calculate(exampleA({ timeText: "241h" })).ok, false);
  assert.equal(calculate(exampleA({ timeText: "0" })).ok, false);
  assert.equal(calculate(exampleA({ usageAmount: "0.01" })).ok, true);
  assert.equal(calculate(exampleA({ usageAmount: "0.009" })).ok, false);
  assert.equal(calculate(exampleA({ usageAmount: "50000" })).ok, true);
  assert.equal(calculate(exampleA({ usageAmount: "50001" })).ok, false);
  assert.equal(calculate(exampleA({ packageAmount: "20", packageUnit: "kg" })).ok, true);
  assert.equal(calculate(exampleA({ packageAmount: "20.001", packageUnit: "kg" })).ok, false);
  assert.equal(calculate(exampleA({ power: "1" })).ok, true);
  assert.equal(calculate(exampleA({ power: "5000" })).ok, true);
  assert.equal(calculate(exampleA({ power: "0" })).ok, false);
  assert.equal(calculate(exampleA({ power: "5001" })).ok, false);
  assert.equal(calculate(exampleA({ failureRate: "80" })).ok, true);
  assert.equal(calculate(exampleA({ failureRate: "81" })).ok, false);
  assert.equal(calculate(exampleA({ priceMethod: "margin", pricePercent: "90" })).ok, true);
  assert.equal(calculate(exampleA({ priceMethod: "margin", pricePercent: "91" })).ok, false);
  assert.equal(calculate(exampleA({ pricePercent: "1000" })).ok, true);
  assert.equal(calculate(exampleA({ pricePercent: "1001" })).ok, false);
  assert.equal(calculate(exampleA({ electricity: "0" })).ok, true);
});

test("parseTime keeps exact hours for the documented forms", () => {
  const expected = 5 + 23 / 60;
  for (const raw of ["5h 23m", "5h23m", "5H 23M", "5:23", "5 hours 23 minutes", "5 hr 23 min", "323m", "323 min"]) {
    const parsed = parseTime(raw);
    assert.equal(parsed.ok, true, raw);
    assert.ok(Math.abs(parsed.hours - expected) < 1e-12, raw);
  }
  assert.equal(parseTime("5.5h").hours, 5.5);
  assert.equal(parseTime("5.5").hours, 5.5);
  assert.equal(parseTime("5,5").hours, 5.5);
  assert.equal(parseTime("abc").ok, false);
  assert.equal(parseTime("   ").ok, false);
});

test("typed weight units convert, and a mismatched unit does not calculate", () => {
  const grams = calculate(exampleA({ packageAmount: "1.2 kg", packageUnit: "g" }));
  const ignored = calculate(exampleA({ packageAmount: "1.2", packageUnit: "g" }));
  assert.equal(formatMoney(grams.lines[0].cents, "USD"), "$1.67");
  assert.notEqual(grams.lines[0].cents, ignored.lines[0].cents);
  assert.equal(quantityNote("1.2 kg", "weight", "g").note, "Read as 1.2 kg");
  assert.equal(quantityNote("87.4 g", "weight", "kg").note, "Read as 87.4 g");
  assert.equal(quantityNote("38.5 ml", "volume", "L").note, "Read as 38.5 ml");

  const spool = calculate(exampleA({ packageAmount: "1000g", packageUnit: "kg" }));
  assert.equal(spool.ok, true, spool.errors && spool.errors.join("; "));
  assert.equal(spool.errors.some((error) => error.includes("20 kg")), false);
  assert.equal(formatMoney(spool.lines[0].cents, "USD"), "$2.01");
  assert.equal(quantityNote("1000g", "weight", "kg").note, "Read as 1000 g");

  const mismatch = calculate(exampleA({ usageAmount: "12 ml" }));
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.errors.join(" "), /volume unit/);
  assert.equal(JSON.stringify(mismatch).includes("NaN"), false);
  const resinMismatch = calculate(exampleA({
    mode: "resin",
    packageAmount: "1",
    packageUnit: "L",
    usageAmount: "10 g",
    usageUnit: "ml",
  }));
  assert.equal(resinMismatch.ok, false);
  assert.match(resinMismatch.errors.join(" "), /weight unit/);
});

test("currency symbols switch USD and do not confuse CA$ or A$ with $", () => {
  assert.equal(detectCurrency("CA$12"), "CAD");
  assert.equal(detectCurrency("A$12"), "AUD");
  assert.equal(detectCurrency("$12"), "USD");
  assert.equal(detectCurrency("NT$590"), "TWD");
  assert.equal(detectCurrency("€9"), "EUR");
  assert.equal(detectCurrency("£4"), "GBP");
  assert.deepEqual(currencyChoice("USD", ["NT$590"]), {
    currency: "TWD",
    note: "Currency switched to TWD because you typed NT$.",
  });
  assert.equal(
    currencyChoice("USD", ["590 TWD"]).note,
    "Currency switched to TWD because you typed TWD.",
  );
  assert.match(currencyChoice("USD", ["€12"]).note, /because you typed €/);
  assert.match(currencyChoice("USD", ["12 EUR"]).note, /because you typed EUR/);
  assert.match(currencyChoice("USD", ["CA$8"]).note, /because you typed CA\$/);
  assert.equal(currencyChoice("USD", ["$22.99"]).note, "");
  const stay = currencyChoice("EUR", ["NT$590"]);
  assert.equal(stay.currency, "EUR");
  assert.match(stay.note, /Currency stays EUR/);
  assert.match(stay.note, /NT\$/);
  const mixed = currencyChoice("USD", ["NT$10", "€2"]);
  assert.equal(mixed.currency, "USD");
  assert.match(mixed.note, /more than one currency symbol/);
});

test("an auto-switch note stays until the symbol is gone or Currency is changed", () => {
  const first = retainCurrencyNote({
    current: "USD",
    raws: ["NT$590", "", "", "", ""],
    sticky: null,
    fromSelector: false,
  });
  assert.equal(first.currency, "TWD");
  assert.match(first.note, /Currency switched to TWD because you typed NT\$/);
  const afterBlur = retainCurrencyNote({
    current: first.currency,
    raws: ["NT$590", "", "", "", ""],
    sticky: first.sticky,
    fromSelector: false,
  });
  assert.equal(afterBlur.note, first.note);
  const afterOtherField = retainCurrencyNote({
    current: afterBlur.currency,
    raws: ["NT$590", "0.16", "", "", ""],
    sticky: afterBlur.sticky,
    fromSelector: false,
  });
  assert.equal(afterOtherField.note, first.note);
  const plain = retainCurrencyNote({
    current: afterOtherField.currency,
    raws: ["590", "0.16", "", "", ""],
    sticky: afterOtherField.sticky,
    fromSelector: false,
  });
  assert.equal(plain.note, "");
  assert.equal(plain.sticky, null);
  const changed = retainCurrencyNote({
    current: "EUR",
    raws: ["NT$590"],
    sticky: first.sticky,
    fromSelector: true,
  });
  assert.equal(changed.currency, "EUR");
  assert.equal(changed.note, "You picked EUR. Your prices still show NT$.");
  assert.equal(changed.locked, true);
  const backToUsd = retainCurrencyNote({
    current: "USD",
    raws: ["NT$590"],
    sticky: first.sticky,
    fromSelector: true,
    locked: false,
  });
  assert.equal(backToUsd.currency, "USD");
  assert.equal(backToUsd.note, "You picked USD. Your prices still show NT$.");
  const stillLocked = retainCurrencyNote({
    current: "USD",
    raws: ["NT$590"],
    sticky: backToUsd.sticky,
    fromSelector: false,
    locked: backToUsd.locked,
  });
  assert.equal(stillLocked.currency, "USD");
  assert.equal(stillLocked.note, backToUsd.note);
  const typedCode = retainCurrencyNote({
    current: "USD",
    raws: ["590 TWD"],
    sticky: null,
    fromSelector: false,
    locked: true,
  });
  assert.equal(typedCode.currency, "USD");
  assert.equal(typedCode.note, "You picked USD. Your prices still show TWD.");
});

test("new print time formats round seconds and keep the old forms", () => {
  const base = parseTime("5h 23m");
  assert.equal(parseTime("5h 23m 12s").hours, base.hours);
  assert.equal(parseTime("05:23:00").hours, base.hours);
  assert.equal(parseTime("23m 12s").hours, 23 / 60);
  assert.equal(parseTime("23m 30s").hours, 24 / 60);
  assert.equal(parseTime("1d 2h 3m").hours, 26 + 3 / 60);
  assert.equal(parseTime("1d 2h 3m").wholeHours, 26);
  assert.equal(parseTime("1d 2h 3m").minutePart, 3);
  const withSeconds = money(calculate(exampleA({ timeText: "5h 23m 12s" })));
  assert.equal(withSeconds.price, "$10.67");
  assert.equal(parseTime("nope").ok, false);
});

test("depreciation fields are ignored while the switch is off", () => {
  const off = calculate(exampleA({
    depreciationOn: false,
    machinePrice: "nope",
    machineHours: "0",
  }));
  assert.equal(off.ok, true);
  assert.equal(off.lines.some((line) => line.id === "wear"), false);
});
