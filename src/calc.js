/**
 * Pure cost math for the 3D print calculator.
 * Amounts are integer cents after each line is rounded to 2 decimals.
 */

import { DISCLAIMER, MARGIN_NOTE, MARKUP_NOTE } from "./copy.js";

export const CURRENCIES = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  TWD: "NT$",
  AUD: "A$",
};

const UNIT_SUFFIX = /(kg|ml|g|l)$/i;
const CURRENCY_PREFIXES = ["nt$", "us$", "au$", "ca$", "hk$", "a$", "c$", "ntd", "usd", "eur", "gbp", "cad", "twd", "aud", "€", "£", "$"];
const CURRENCY_CODES = /^(usd|eur|gbp|cad|twd|aud|ntd)|(?:usd|eur|gbp|cad|twd|aud|ntd)$/g;

export function formatMoney(cents, currency) {
  const prefix = CURRENCIES[currency] || "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${prefix}${whole}.${frac}`;
}

export function toCents(n) {
  if (!Number.isFinite(n)) return null;
  const sign = n < 0 ? -1 : 1;
  const rounded = Math.round(Number((Math.abs(n) * 100).toFixed(8)));
  if (!Number.isFinite(rounded) || rounded > Number.MAX_SAFE_INTEGER) return null;
  return sign * rounded;
}

function trimNum(n) {
  if (!Number.isFinite(n)) return "";
  const s = n.toFixed(6).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

function parseGrouped(body) {
  if (!/^[+-]?[0-9.,]+$/.test(body)) return null;
  let s = body;
  let neg = false;
  if (s[0] === "+" || s[0] === "-") {
    neg = s[0] === "-";
    s = s.slice(1);
  }
  if (!s || s === "." || s === ",") return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let normalized;
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastDot > lastComma) {
      if (!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return null;
      normalized = s.replace(/,/g, "");
    } else if (!/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      return null;
    } else {
      normalized = s.replace(/\./g, "").replace(",", ".");
    }
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) normalized = s.replace(/,/g, "");
    else if (/^\d+,\d{1,2}$/.test(s)) normalized = s.replace(",", ".");
    else return null;
  } else if (!/^\d+(\.\d+)?$/.test(s)) {
    return null;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Parse a pasted number or price. Does not apply range limits. */
export function parseLooseNumber(raw) {
  if (raw == null) return { ok: false, reason: "empty" };
  let s = String(raw).trim().replace(/\s+/g, "").replace(/^−/, "-");
  if (!s) return { ok: false, reason: "empty" };
  s = s.toLowerCase();
  if (UNIT_SUFFIX.test(s)) s = s.replace(UNIT_SUFFIX, "");
  let stripped = true;
  while (stripped && s) {
    stripped = false;
    for (const prefix of CURRENCY_PREFIXES) {
      if (s.startsWith(prefix)) {
        s = s.slice(prefix.length);
        stripped = true;
        break;
      }
    }
  }
  s = s.replace(CURRENCY_CODES, "");
  if (s.endsWith("%")) s = s.slice(0, -1);
  if (!s) return { ok: false, reason: "empty" };
  const n = parseGrouped(s);
  if (n == null) return { ok: false, reason: "format" };
  return { ok: true, value: n };
}

const UNIT_WORD = /(kg|ml|g|l)$/i;

/**
 * Weight or volume. A typed unit wins over the dropdown.
 * kind is "weight" (g, kg) or "volume" (ml, L).
 */
export function parseQuantity(raw, kind) {
  if (raw == null || String(raw).trim() === "") return { ok: false, reason: "empty" };
  let body = String(raw).trim().replace(/\s+/g, "").replace(/^−/, "-").toLowerCase();
  if (!body) return { ok: false, reason: "empty" };
  let unit = null;
  const suffix = body.match(UNIT_WORD);
  if (suffix) {
    unit = suffix[1] === "l" ? "L" : suffix[1];
    body = body.slice(0, -suffix[1].length);
  }
  const value = parseGrouped(body);
  if (value == null) return { ok: false, reason: "format" };
  if (unit) {
    const weight = unit === "g" || unit === "kg";
    if (kind === "weight" && !weight) {
      return { ok: false, reason: "unit", error: `${unit} is a volume unit. This field uses g or kg.` };
    }
    if (kind === "volume" && weight) {
      return { ok: false, reason: "unit", error: `${unit} is a weight unit. This field uses ml or L.` };
    }
  }
  return { ok: true, value, unit };
}

export function quantityNote(raw, kind) {
  const parsed = parseQuantity(raw, kind);
  if (!parsed.ok) {
    return parsed.reason === "unit" ? { error: parsed.error, note: "" } : { error: "", note: "" };
  }
  if (!parsed.unit) return { error: "", note: "" };
  const amount = String(raw).trim().replace(/\s*(kg|ml|g|l)\s*$/i, "").trim();
  return { error: "", note: `Read as ${amount} ${parsed.unit}` };
}

const CURRENCY_MARKERS = [
  ["nt$", "TWD"],
  ["ntd", "TWD"],
  ["twd", "TWD"],
  ["ca$", "CAD"],
  ["cad", "CAD"],
  ["au$", "AUD"],
  ["aud", "AUD"],
  ["a$", "AUD"],
  ["us$", "USD"],
  ["usd", "USD"],
  ["€", "EUR"],
  ["eur", "EUR"],
  ["£", "GBP"],
  ["gbp", "GBP"],
  ["$", "USD"],
];

const TYPED_SYMBOL = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  TWD: "NT$",
  AUD: "A$",
};

const TOKEN_PATTERNS = [/NT\$/i, /NTD/i, /TWD/i, /CA\$/i, /CAD/i, /AU\$/i, /AUD/i, /A\$/i, /US\$/i, /USD/i, /€/, /EUR/i, /£/, /GBP/i, /\$/];

export function detectCurrency(raw) {
  if (raw == null) return null;
  const s = String(raw).toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  for (const [marker, code] of CURRENCY_MARKERS) {
    if (s.includes(marker)) return code;
  }
  return null;
}

/** The currency symbol or code as the user typed it, preferring the longest match. */
export function typedCurrencyToken(raw) {
  if (raw == null) return null;
  const s = String(raw);
  let best = null;
  for (const pattern of TOKEN_PATTERNS) {
    const match = pattern.exec(s);
    if (!match) continue;
    const token = match[0];
    if (!best || match.index < best.index || (match.index === best.index && token.length > best.token.length)) {
      best = { token, index: match.index };
    }
  }
  return best ? best.token : null;
}

function tokensIn(raws) {
  const tokens = [];
  for (const raw of raws) {
    const token = typedCurrencyToken(raw);
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

function listTokens(tokens) {
  if (tokens.length === 1) return tokens[0];
  if (tokens.length === 2) return `${tokens[0]} and ${tokens[1]}`;
  return `${tokens.slice(0, -1).join(", ")}, and ${tokens[tokens.length - 1]}`;
}

export function currencyChoice(current, raws) {
  const found = [];
  for (const raw of raws) {
    const code = detectCurrency(raw);
    if (code) found.push(code);
  }
  const unique = [...new Set(found)];
  if (unique.length === 0) return { currency: current, note: "" };
  if (unique.length > 1) {
    return {
      currency: current,
      note: "These prices use more than one currency symbol. The selector was not changed. Amounts are not converted.",
    };
  }
  const detected = unique[0];
  const token = tokensIn(raws).find((item) => detectCurrency(item) === detected) || TYPED_SYMBOL[detected];
  if (detected === current) return { currency: current, note: "" };
  if (current === "USD") {
    return {
      currency: detected,
      note: `Currency switched to ${detected} because you typed ${token}.`,
    };
  }
  return {
    currency: current,
    note: `Currency stays ${current}. You typed ${token}, and amounts are not converted.`,
  };
}

/** Keep an auto-switch note until the symbol is gone. A manual selector choice is never overridden. */
export function retainCurrencyNote({ current, raws, sticky, fromSelector, locked }) {
  const userLocked = Boolean(locked || fromSelector);
  if (userLocked) {
    const conflicting = tokensIn(raws).filter((token) => detectCurrency(token) !== current);
    const note = conflicting.length
      ? `You picked ${current}. Your prices still show ${listTokens(conflicting)}.`
      : "";
    return { currency: current, note, sticky: null, locked: true };
  }
  const remembered = sticky;
  const decision = currencyChoice(current, raws);
  let nextSticky = remembered;
  if (decision.note.startsWith("Currency switched to ")) {
    nextSticky = { currency: decision.currency, note: decision.note };
  }
  let note = decision.note;
  if (!note && nextSticky) {
    const symbolStillThere = raws.some((raw) => detectCurrency(raw) === nextSticky.currency);
    if (symbolStillThere && decision.currency === nextSticky.currency) note = nextSticky.note;
    else nextSticky = null;
  }
  return { currency: decision.currency, note, sticky: nextSticky, locked: false };
}

function formatHM(hours) {
  const totalSeconds = Math.round(hours * 3600);
  const wholeHours = Math.floor(totalSeconds / 3600);
  const minutePart = (totalSeconds % 3600) / 60;
  const minLabel = Number.isInteger(minutePart) ? String(minutePart) : trimNum(minutePart);
  return {
    wholeHours,
    minutePart,
    display: `${wholeHours} h ${minLabel} min`,
  };
}

function finishTime(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return { ok: false, reason: "format" };
  const hours = totalMinutes / 60;
  const shown = formatHM(hours);
  const formula = shown.minutePart === 0
    ? String(shown.wholeHours)
    : `${shown.wholeHours} + ${trimNum(shown.minutePart)}/60`;
  return { ok: true, hours, formula, ...shown };
}

/**
 * Read a print time as hours. Seconds round to the nearest minute.
 * Days add 24 hours each. reason: empty | format
 */
export function parseTime(raw) {
  if (raw == null || String(raw).trim() === "") return { ok: false, reason: "empty" };
  const s = String(raw).trim().replace(/\s+/g, " ").toLowerCase().replace(/−/g, "-");

  let m = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    if (min >= 60 || sec >= 60) return { ok: false, reason: "format" };
    return finishTime(h * 60 + min + Math.round(sec / 60));
  }
  m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (min >= 60) return { ok: false, reason: "format" };
    return finishTime(h * 60 + min);
  }

  const token = /\s*(\d[\d.,]*)\s*(days|day|d|hours|hour|hrs|hr|h|minutes|minute|mins|min|m|seconds|second|secs|sec|s)/y;
  const parts = { d: null, h: null, m: null, s: null };
  const unitOf = {
    d: "d", day: "d", days: "d",
    h: "h", hr: "h", hrs: "h", hour: "h", hours: "h",
    m: "m", min: "m", mins: "m", minute: "m", minutes: "m",
    s: "s", sec: "s", secs: "s", second: "s", seconds: "s",
  };
  let saw = false;
  while (token.lastIndex < s.length) {
    const match = token.exec(s);
    if (!match) break;
    const value = parseGrouped(match[1]);
    const key = unitOf[match[2]];
    if (value == null || parts[key] != null) return { ok: false, reason: "format" };
    parts[key] = value;
    saw = true;
    if (token.lastIndex === s.length) {
      const seconds = parts.s || 0;
      const minutes = (parts.d || 0) * 24 * 60 + (parts.h || 0) * 60 + (parts.m || 0) + Math.round(seconds / 60);
      return finishTime(minutes);
    }
  }
  if (saw) return { ok: false, reason: "format" };

  const bare = s.match(/^(\d[\d.,]*)$/);
  if (bare) {
    const h = parseGrouped(bare[1]);
    if (h == null) return { ok: false, reason: "format" };
    return finishTime(h * 60);
  }
  return { ok: false, reason: "format" };
}

function baseUnit(mode) {
  return mode === "resin" ? "ml" : "g";
}

function packageUnitOk(mode, unit) {
  return mode === "resin" ? unit === "ml" || unit === "L" : unit === "g" || unit === "kg";
}

function toBase(amount, unit) {
  if (unit === "kg" || unit === "L") return amount * 1000;
  return amount;
}

function fieldNumber(raw, { label, required, allowBlankZero, min, max, money }) {
  const parsed = parseLooseNumber(raw);
  if (!parsed.ok) {
    if (parsed.reason === "empty") {
      if (required) return { error: `Enter ${label}.` };
      if (allowBlankZero) return { value: 0, blank: true };
      return { error: `Enter ${label}.` };
    }
    return { error: `${label} is not a number. Enter a plain number${money ? " such as 22.99 or $22.99" : ""}.` };
  }
  if (min != null && parsed.value < min) {
    return { error: `${label} must be at least ${trimNum(min)}.` };
  }
  if (max != null && parsed.value > max) {
    return { error: `${label} must be at most ${trimNum(max)}.` };
  }
  return { value: parsed.value, blank: false };
}

function line(id, label, unrounded, formula) {
  const cents = toCents(unrounded);
  return { id, label, cents, formula };
}

function readAmount(raw, { label, kind, dropdown, required }) {
  const parsed = parseQuantity(raw, kind);
  if (!parsed.ok) {
    if (parsed.reason === "empty") {
      if (!required) return { blank: true, base: 0 };
      return { error: `Enter ${label}.` };
    }
    if (parsed.reason === "unit") {
      return { error: `${label}: ${parsed.error} Nothing is calculated from that value.` };
    }
    return {
      error: `${label} is not a number. Enter a value like ${kind === "volume" ? "38.5 or 12 ml" : "87.4 or 1.2 kg"}.`,
    };
  }
  if (parsed.value < 0) return { error: `${label} cannot be negative.` };
  const unit = parsed.unit || dropdown;
  if (!packageUnitOk(kind === "volume" ? "resin" : "filament", unit)) {
    return { error: `${label} needs a ${kind === "volume" ? "ml or L" : "g or kg"} unit.` };
  }
  return { blank: false, base: toBase(parsed.value, unit) };
}

export function calculate(input) {
  const errors = [];
  const mode = input.mode === "resin" ? "resin" : input.mode === "filament" ? "filament" : null;
  if (!mode) errors.push("Choose Filament or Resin.");
  const currency = Object.prototype.hasOwnProperty.call(CURRENCIES, input.currency) ? input.currency : null;
  if (!currency) errors.push("Choose a currency. Amounts are not converted.");

  const names = mode === "resin"
    ? { price: "Bottle price", pack: "Bottle volume", usage: "Print volume", waste: "Extra waste" }
    : { price: "Spool price", pack: "Spool weight", usage: "Print weight", waste: "Extra waste" };
  const unitName = mode === "resin" ? "ml" : "g";
  const packMaxLabel = mode === "resin" ? "20 L" : "20 kg";

  const kind = mode === "resin" ? "volume" : "weight";
  const price = fieldNumber(input.materialPrice, {
    label: names.price,
    required: true,
    min: 0,
    money: true,
  });
  if (price.error) {
    errors.push(price.error.includes("at least")
      ? `${names.price} cannot be negative. Enter 0 or a positive price.`
      : price.error.replace(`Enter ${names.price}.`, `Enter ${names.price}, for example ${mode === "resin" ? "39.00" : "22.99"}.`));
  }

  const pack = readAmount(input.packageAmount, {
    label: names.pack,
    kind,
    dropdown: input.packageUnit,
    required: true,
  });
  let packBase = null;
  if (pack.error) {
    errors.push(pack.error.includes("at least 0") || String(input.packageAmount).trim() === "0"
      ? `${names.pack} must be more than 0. Enter the amount on the package.`
      : pack.error);
  } else if (pack.base === 0) {
    errors.push(`${names.pack} must be more than 0. Enter the amount on the package.`);
  } else if (pack.base > 20000) {
    errors.push(`${names.pack} must be ${packMaxLabel} or less.`);
  } else {
    packBase = pack.base;
  }

  const usage = readAmount(input.usageAmount, {
    label: names.usage,
    kind,
    dropdown: input.usageUnit,
    required: true,
  });
  let usageBase = null;
  if (usage.error) {
    errors.push(usage.error.startsWith("Enter ")
      ? `Enter ${names.usage}, for example ${mode === "resin" ? "38.5 ml" : "87.4 g"}.`
      : usage.error);
  } else if (usage.base < 0.01 || usage.base > 50000) {
    errors.push(`${names.usage} must be from 0.01 ${unitName} to 50,000 ${unitName}. Enter an amount in that range.`);
  } else {
    usageBase = usage.base;
  }

  const waste = readAmount(input.wasteAmount, {
    label: names.waste,
    kind,
    dropdown: input.wasteUnit || input.usageUnit,
    required: false,
  });
  let wasteBase = 0;
  if (waste.error) {
    errors.push(waste.error.includes("cannot be negative")
      ? "Extra waste cannot be negative. Enter 0 or leave it blank."
      : waste.error);
  } else if (!waste.blank && waste.base > 50000) {
    errors.push(`Extra waste must be 50,000 ${unitName} or less.`);
  } else if (!waste.blank) {
    wasteBase = waste.base;
  }

  const time = parseTime(input.timeText);
  let hours = null;
  if (!time.ok) {
    errors.push(time.reason === "empty"
      ? "Enter a print time, for example 5h 23m."
      : "Print time is not a time. Enter a time like 5h 23m.");
  } else if (time.hours <= 0) {
    errors.push("Print time must be more than 0. Enter a time like 5h 23m.");
  } else if (time.hours > 240) {
    errors.push("Print time must be 240 hours or less. Enter a shorter time.");
  } else {
    hours = time.hours;
  }

  const power = fieldNumber(input.power, { label: "Power (W)", required: true, min: 0 });
  let watts = null;
  if (power.error) {
    errors.push(power.error.startsWith("Enter ")
      ? "Enter Power (W), a number from 1 to 5,000."
      : power.error.includes("at least")
        ? "Power (W) cannot be negative. Enter a number from 1 to 5,000."
        : "Power (W) is not a number. Enter a number from 1 to 5,000.");
  } else if (power.value < 1 || power.value > 5000) {
    errors.push("Power (W) must be from 1 to 5,000. Enter a wattage in that range.");
  } else {
    watts = power.value;
  }

  const electricity = fieldNumber(input.electricity, {
    label: "Electricity price",
    required: true,
    min: 0,
    money: true,
  });
  let kwh = null;
  if (electricity.error) {
    errors.push(electricity.error.startsWith("Enter ")
      ? "Enter Electricity price for one kWh, for example 0.16."
      : electricity.error.includes("at least")
        ? "Electricity price cannot be negative. Enter 0 or a positive price."
        : "Electricity price is not a number. Enter a price like 0.16.");
  } else {
    kwh = electricity.value;
  }

  const minutesBlank = input.laborMinutes == null || String(input.laborMinutes).trim() === "";
  const rateBlank = input.hourlyRate == null || String(input.hourlyRate).trim() === "";
  let laborMinutes = 0;
  let hourly = 0;
  let useLabor = false;
  if (!minutesBlank || !rateBlank) {
    const minutes = fieldNumber(minutesBlank ? "0" : input.laborMinutes, {
      label: "Hands-on minutes",
      required: true,
      min: 0,
    });
    const rate = fieldNumber(rateBlank ? "0" : input.hourlyRate, {
      label: "Hourly rate",
      required: true,
      min: 0,
      money: true,
    });
    if (minutes.error) {
      errors.push(minutes.error.includes("at least")
        ? "Hands-on minutes cannot be negative. Enter 0 or leave it blank."
        : "Hands-on minutes is not a number. Enter minutes, or leave it blank.");
    }
    if (rate.error) {
      errors.push(rate.error.includes("at least")
        ? "Hourly rate cannot be negative. Enter 0 or leave it blank."
        : "Hourly rate is not a number. Enter a rate like 20, or leave it blank.");
    }
    if (!minutes.error && !rate.error) {
      if (minutes.value > 0 && rateBlank) {
        errors.push("Enter Hourly rate, or clear Hands-on minutes.");
      } else if (minutes.value > 0) {
        laborMinutes = minutes.value;
        hourly = rate.value;
        useLabor = true;
      }
    }
  }

  let useWear = false;
  let machinePrice = 0;
  let machineHours = 0;
  if (input.depreciationOn) {
    const bought = fieldNumber(input.machinePrice, { label: "Machine price", required: true, min: 0, money: true });
    const life = fieldNumber(input.machineHours, { label: "Expected print hours", required: true, min: 0 });
    if (bought.error) {
      errors.push(bought.error.startsWith("Enter ")
        ? "Enter Machine price, or turn off Count machine wear."
        : bought.error.includes("at least")
          ? "Machine price cannot be negative. Enter 0 or a positive price, or turn off Count machine wear."
          : "Machine price is not a number. Enter a price, or turn off Count machine wear.");
    }
    if (life.error || (!life.error && life.value <= 0)) {
      errors.push("Enter Expected print hours (more than 0), or turn off Count machine wear.");
    }
    if (!bought.error && !life.error && life.value > 0) {
      useWear = true;
      machinePrice = bought.value;
      machineHours = life.value;
    }
  }

  const other = fieldNumber(input.otherCosts, {
    label: "Other costs",
    required: false,
    allowBlankZero: true,
    min: 0,
    money: true,
  });
  let otherValue = 0;
  let useOther = false;
  if (other.error) {
    errors.push(other.error.includes("at least")
      ? "Other costs cannot be negative. Enter 0 or leave it blank."
      : "Other costs is not a number. Enter 0 or leave it blank.");
  } else if (!other.blank && other.value > 0) {
    otherValue = other.value;
    useOther = true;
  }

  const failure = fieldNumber(
    input.failureRate == null || String(input.failureRate).trim() === "" ? "0" : input.failureRate,
    { label: "Failure rate (%)", required: true, min: 0 },
  );
  let failureRate = 0;
  if (failure.error) {
    errors.push(failure.error.includes("at least")
      ? "Failure rate (%) cannot be negative. Enter a percent from 0 to 80."
      : "Failure rate (%) is not a number. Enter a percent from 0 to 80.");
  } else if (failure.value > 80) {
    errors.push("Failure rate must be from 0 to 80. 100 is not allowed, because the cost would be divided by zero.");
  } else {
    failureRate = failure.value;
  }

  const method = input.priceMethod === "margin" ? "margin" : input.priceMethod === "markup" ? "markup" : null;
  if (!method) errors.push("Choose Markup or Margin.");
  const percent = fieldNumber(input.pricePercent, {
    label: method === "margin" ? "Margin percent" : "Markup percent",
    required: true,
    min: 0,
  });
  let pricePercent = null;
  if (percent.error) {
    errors.push(percent.error.startsWith("Enter ")
      ? `Enter ${method === "margin" ? "Margin percent" : "Markup percent"}.`
      : percent.error.includes("at least")
        ? `${method === "margin" ? "Margin" : "Markup"} percent cannot be negative.`
        : `${method === "margin" ? "Margin percent" : "Markup percent"} is not a number.`);
  } else if (method === "margin" && percent.value > 90) {
    errors.push("Margin must be from 0 to 90. 100 is not allowed, because the price would be divided by zero.");
  } else if (method === "markup" && percent.value > 1000) {
    errors.push("Markup must be from 0 to 1,000.");
  } else if (method) {
    pricePercent = percent.value;
  }

  if (errors.length) return { ok: false, errors };

  const usedBase = usageBase + wasteBase;
  const materialRaw = (usedBase / packBase) * price.value;
  const materialFormula = `(${trimNum(usedBase)} ${unitName} ÷ ${trimNum(packBase)} ${unitName}) × ${trimNum(price.value)} = ${moneyPlain(materialRaw)}`;
  const electricityRaw = (watts / 1000) * hours * kwh;
  const electricityFormula = `(${trimNum(watts)} ÷ 1000) × (${time.formula}) × ${trimNum(kwh)} = ${moneyPlain(electricityRaw)}`;

  const lines = [
    line("material", "Material", materialRaw, materialFormula),
    line("electricity", "Electricity", electricityRaw, electricityFormula),
  ];

  if (useLabor) {
    const laborRaw = (laborMinutes / 60) * hourly;
    lines.push(line(
      "labor",
      "Labor",
      laborRaw,
      `(${trimNum(laborMinutes)} ÷ 60) × ${trimNum(hourly)} = ${moneyPlain(laborRaw)}`,
    ));
  }
  if (useWear) {
    const wearRaw = (machinePrice / machineHours) * hours;
    lines.push(line(
      "wear",
      "Machine wear",
      wearRaw,
      `(${trimNum(machinePrice)} ÷ ${trimNum(machineHours)}) × (${time.formula}) = ${moneyPlain(wearRaw)}`,
    ));
  }
  if (useOther) {
    lines.push(line("other", "Other costs", otherValue, `${trimNum(otherValue)} = ${moneyPlain(otherValue)}`));
  }

  if (lines.some((item) => item.cents == null)) {
    return {
      ok: false,
      errors: ["This number is too large to calculate. Enter a smaller one."],
    };
  }

  const subtotalCents = lines.reduce((sum, item) => sum + item.cents, 0);
  const subtotalFormula = `${lines.map((item) => moneyPlain(item.cents / 100)).join(" + ")} = ${moneyPlain(subtotalCents / 100)}`;
  let successCents = subtotalCents;
  let failureShareCents = null;
  let failureFormula = null;
  let successFormula = subtotalFormula;
  if (failureRate > 0) {
    const successRaw = (subtotalCents / 100) / (1 - failureRate / 100);
    const successRounded = toCents(successRaw);
    if (successRounded == null) {
      return { ok: false, errors: ["This number is too large to calculate. Enter a smaller one."] };
    }
    successCents = successRounded;
    failureShareCents = successCents - subtotalCents;
    successFormula = `${moneyPlain(subtotalCents / 100)} ÷ (1 − ${trimNum(failureRate)}/100) = ${moneyPlain(successCents / 100)}`;
    failureFormula = `${moneyPlain(successCents / 100)} - ${moneyPlain(subtotalCents / 100)} = ${moneyPlain(failureShareCents / 100)}`;
  }

  const priceRaw = method === "markup"
    ? (successCents / 100) * (1 + pricePercent / 100)
    : (successCents / 100) / (1 - pricePercent / 100);
  const priceCents = toCents(priceRaw);
  if (priceCents == null) {
    return { ok: false, errors: ["This number is too large to calculate. Enter a smaller one."] };
  }
  const priceFormula = method === "markup"
    ? `${moneyPlain(successCents / 100)} × (1 + ${trimNum(pricePercent)}/100) = ${moneyPlain(priceCents / 100)}`
    : `${moneyPlain(successCents / 100)} ÷ (1 − ${trimNum(pricePercent)}/100) = ${moneyPlain(priceCents / 100)}`;
  const priceSentence = method === "markup"
    ? `Suggested price uses markup, not margin. Price = cost × (1 + ${trimNum(pricePercent)}/100).`
    : `Suggested price uses margin, not markup. Price = cost ÷ (1 − ${trimNum(pricePercent)}/100).`;

  const perBase = lines[0].cents / 100 / usedBase;
  const perHourRaw = (successCents / 100) / hours;
  const perHourCents = toCents(perHourRaw);
  if (perHourCents == null) {
    return { ok: false, errors: ["This number is too large to calculate. Enter a smaller one."] };
  }
  const perUnitLabel = mode === "resin" ? "Material cost per ml" : "Material cost per gram";

  const packLabel = `${trimNum(packBase)} ${unitName}`;
  const usageLabel = `${trimNum(usageBase)} ${unitName}`;
  const wasteLabel = wasteBase > 0 ? `${trimNum(wasteBase)} ${unitName}` : "0";
  const readAs = [
    `Print time ${time.display} (${time.formula} hours)`,
    `${names.usage} ${usageLabel}`,
    wasteBase > 0 ? `Extra waste ${wasteLabel}` : null,
    `${names.pack} ${packLabel}`,
    `${names.price} ${trimNum(price.value)}`,
  ].filter(Boolean).join("; ");

  const partName = String(input.partName || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 80);

  return {
    ok: true,
    errors: [],
    currency,
    lines,
    subtotalCents,
    subtotalFormula,
    showSubtotal: failureRate > 0,
    failureShareCents,
    failureFormula,
    successCents,
    successFormula,
    priceCents,
    priceFormula,
    priceSentence,
    priceMethod: method,
    pricePercent,
    perUnitLabel,
    perUnit: perBase,
    perHourCents,
    perHourFormula: perHourCents == null
      ? ""
      : `${moneyPlain(successCents / 100)} ÷ (${time.formula}) = ${moneyPlain(perHourCents / 100)}`,
    readAs,
    timeDisplay: time.display,
    partName,
    markupNote: MARKUP_NOTE,
    marginNote: MARGIN_NOTE,
  };
}

function moneyPlain(n) {
  const c = toCents(n);
  if (c == null) return "";
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function plainText(result, toolName) {
  if (!result.ok) return result.errors.join("\n");
  const lines = [];
  lines.push(toolName);
  if (result.partName) lines.push(`Part: ${result.partName}`);
  lines.push(`Read as: ${result.readAs}`);
  lines.push("");
  for (const item of result.lines) {
    lines.push(`${item.label}: ${formatMoney(item.cents, result.currency)}`);
    lines.push(item.formula);
  }
  if (result.showSubtotal) {
    lines.push(`Subtotal: ${formatMoney(result.subtotalCents, result.currency)}`);
    lines.push(result.subtotalFormula);
    lines.push(`Failure share: ${formatMoney(result.failureShareCents, result.currency)}`);
    lines.push(result.failureFormula);
  }
  lines.push(`Cost of one successful part: ${formatMoney(result.successCents, result.currency)}`);
  lines.push(result.successFormula);
  lines.push(`Suggested price: ${formatMoney(result.priceCents, result.currency)}`);
  lines.push(result.priceSentence);
  lines.push(result.priceFormula);
  lines.push(`${result.perUnitLabel}: ${result.perUnit.toFixed(4)}`);
  if (result.perHourCents != null) {
    lines.push(`Cost per hour: ${formatMoney(result.perHourCents, result.currency)}`);
    lines.push(result.perHourFormula);
  }
  lines.push("");
  lines.push(DISCLAIMER);
  return lines.join("\n");
}
