import { CURRENCIES, calculate, formatMoney, parseTime, plainText, quantityNote, retainCurrencyNote } from "./calc.js";
import { EMPTY_RESULT, howMaterial, materialLabels, slicerHint } from "./copy.js";
import { WORKED } from "./examples.js";

const $ = (id) => document.getElementById(id);
const STORE = {
  power: "3dprint.power",
  electricity: "3dprint.electricity",
  spoolPrice: "3dprint.spoolPrice",
  bottlePrice: "3dprint.bottlePrice",
  hourly: "3dprint.hourlyRate",
};

let currentMode = "filament";
let latest = null;
let syncing = false;
let currencySticky = null;
let currencyLocked = false;

function load(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function save(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

function setUnits(select, units, selected) {
  const want = selected || select.value;
  select.replaceChildren();
  for (const unit of units) {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit;
    if (unit === want) option.selected = true;
    select.append(option);
  }
  if (select.value !== want) select.value = units[0];
}

function applyMode(next) {
  const labels = materialLabels(next);
  $("label-price").textContent = labels.price;
  $("label-pack").textContent = labels.pack;
  $("label-usage").textContent = labels.usage;
  const how = $("how-material");
  if (how) how.textContent = howMaterial(next);
  $("hint-slicer").textContent = slicerHint(next);
  const units = next === "resin" ? ["ml", "L"] : ["g", "kg"];
  setUnits($("package-unit"), units, next === "resin" ? "ml" : "kg");
  setUnits($("usage-unit"), units, next === "resin" ? "ml" : "g");
  $("package-unit").setAttribute("aria-label", `${labels.pack} unit`);
  $("usage-unit").setAttribute("aria-label", `${labels.usage} unit`);
  $("package-amount").value = next === "resin" ? "1000" : "1";
  const saved = load(next === "resin" ? STORE.bottlePrice : STORE.spoolPrice);
  $("material-price").value = saved;
}

function readInput() {
  return {
    mode: $("mode-resin").checked ? "resin" : "filament",
    currency: $("currency").value,
    materialPrice: $("material-price").value,
    packageAmount: $("package-amount").value,
    packageUnit: $("package-unit").value,
    usageAmount: $("usage-amount").value,
    usageUnit: $("usage-unit").value,
    wasteAmount: $("waste-amount").value,
    wasteUnit: $("usage-unit").value,
    timeText: $("time-text").value,
    power: $("power").value,
    electricity: $("electricity").value,
    laborMinutes: $("labor-minutes").value,
    hourlyRate: $("hourly-rate").value,
    depreciationOn: $("depreciation-on").checked,
    machinePrice: $("machine-price").value,
    machineHours: $("machine-hours").value,
    otherCosts: $("other-costs").value,
    failureRate: $("failure-rate").value,
    priceMethod: $("method-margin").checked ? "margin" : "markup",
    pricePercent: $("price-percent").value,
    partName: $("part-name").value,
  };
}

function addLine(parent, label, amount, formula, className) {
  const row = document.createElement("div");
  row.className = className ? `line ${className}` : "line";
  const head = document.createElement("div");
  head.className = "line-head";
  const name = document.createElement("span");
  name.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = amount;
  head.append(name, strong);
  row.append(head);
  if (formula) {
    const formulaNode = document.createElement("p");
    formulaNode.className = "formula";
    formulaNode.textContent = formula;
    row.append(formulaNode);
  }
  parent.append(row);
}

function render(result) {
  const body = $("result-body");
  body.replaceChildren();
  latest = result.ok ? result : null;
  if ($("copy-result").dataset.busy !== "1") $("copy-result").disabled = !result.ok;
  if ($("print-page").dataset.busy !== "1") $("print-page").disabled = !result.ok;
  if (!result.ok) {
    const intro = document.createElement("p");
    intro.textContent = EMPTY_RESULT;
    body.append(intro);
    const prompts = result.errors.filter((error) => error.startsWith("Enter "));
    const problems = result.errors.filter((error) => !error.startsWith("Enter "));
    if (prompts.length) {
      const prompt = document.createElement("p");
      prompt.className = "hint";
      prompt.textContent = prompts.join(" ");
      body.append(prompt);
    }
    if (problems.length) {
      const alert = document.createElement("p");
      alert.className = "errors";
      alert.setAttribute("role", "alert");
      alert.textContent = problems.join(" ");
      body.append(alert);
    }
    return;
  }
  if (result.partName) {
    const part = document.createElement("p");
    part.className = "part";
    part.textContent = `Part: ${result.partName}`;
    body.append(part);
  }
  const read = document.createElement("p");
  read.className = "reada";
  read.textContent = `Read as: ${result.readAs}`;
  body.append(read);
  for (const item of result.lines) {
    addLine(body, item.label, formatMoney(item.cents, result.currency), item.formula);
  }
  if (result.showSubtotal) {
    addLine(body, "Subtotal", formatMoney(result.subtotalCents, result.currency), result.subtotalFormula);
    addLine(body, "Failure share", formatMoney(result.failureShareCents, result.currency), result.failureFormula);
  }
  addLine(body, "Cost of one successful part", formatMoney(result.successCents, result.currency), result.successFormula);
  addLine(body, "Suggested price", formatMoney(result.priceCents, result.currency), result.priceFormula, "price");
  const sentence = document.createElement("p");
  sentence.className = "note";
  sentence.textContent = result.priceSentence;
  const perUnit = document.createElement("p");
  perUnit.className = "formula";
  perUnit.textContent = `${result.perUnitLabel}: ${CURRENCIES[result.currency]}${result.perUnit.toFixed(4)}`;
  const perHour = document.createElement("p");
  perHour.className = "formula";
  perHour.textContent = `Cost per hour: ${formatMoney(result.perHourCents, result.currency)}. ${result.perHourFormula}`;
  body.append(sentence, perUnit, perHour);
}

function refreshQtyNotes() {
  const kind = $("mode-resin").checked ? "volume" : "weight";
  const fields = [
    ["package-amount", "package-note", "package-unit", $("label-pack").textContent],
    ["usage-amount", "usage-note", "usage-unit", $("label-usage").textContent],
    ["waste-amount", "waste-note", "usage-unit", "Extra waste"],
  ];
  for (const [inputId, noteId, unitId, label] of fields) {
    const note = $(noteId);
    const raw = $(inputId).value;
    if (!raw.trim()) {
      note.textContent = "";
      note.classList.remove("field-error");
      continue;
    }
    const parsed = quantityNote(raw, kind, $(unitId).value);
    if (parsed.error) {
      note.textContent = `${label}: ${parsed.error}`;
      note.classList.add("field-error");
    } else {
      note.textContent = parsed.note;
      note.classList.remove("field-error");
    }
  }
}

function syncCurrency(fromSelector) {
  const decision = retainCurrencyNote({
    current: $("currency").value,
    raws: [
      $("material-price").value,
      $("electricity").value,
      $("hourly-rate").value,
      $("machine-price").value,
      $("other-costs").value,
    ],
    sticky: currencySticky,
    fromSelector,
    locked: currencyLocked,
  });
  currencySticky = decision.sticky;
  currencyLocked = decision.locked;
  if (decision.currency !== $("currency").value) $("currency").value = decision.currency;
  const note = $("currency-note");
  note.textContent = decision.note;
  note.hidden = !decision.note;
}

function updateBar(result) {
  if (!result || !result.ok) {
    $("bar-cost").textContent = "—";
    $("bar-price").textContent = "—";
    return;
  }
  $("bar-cost").textContent = formatMoney(result.successCents, result.currency);
  $("bar-price").textContent = formatMoney(result.priceCents, result.currency);
}

function recalc(fromSelector) {
  syncCurrency(fromSelector);
  refreshQtyNotes();
  const result = calculate(readInput());
  render(result);
  updateBar(result);
}

function onTimeText() {
  if (syncing) return;
  const parsed = parseTime($("time-text").value);
  syncing = true;
  if (!parsed.ok) {
    $("time-hours").value = "";
    $("time-minutes").value = "";
  } else {
    $("time-hours").value = String(parsed.wholeHours);
    $("time-minutes").value = Number.isInteger(parsed.minutePart)
      ? String(parsed.minutePart)
      : String(Math.round(parsed.minutePart * 100) / 100);
  }
  syncing = false;
}

function onTimeParts() {
  if (syncing) return;
  const hours = $("time-hours").value.trim();
  const minutes = $("time-minutes").value.trim();
  syncing = true;
  $("time-text").value = hours === "" && minutes === ""
    ? ""
    : `${hours === "" ? "0" : hours}h ${minutes === "" ? "0" : minutes}m`;
  syncing = false;
}

function onModeChange() {
  const next = $("mode-resin").checked ? "resin" : "filament";
  if (next === currentMode) return;
  save(currentMode === "resin" ? STORE.bottlePrice : STORE.spoolPrice, $("material-price").value.trim());
  currentMode = next;
  applyMode(next);
}

function savePrefs() {
  save(STORE.power, $("power").value.trim());
  save(STORE.electricity, $("electricity").value.trim());
  save(STORE.hourly, $("hourly-rate").value.trim());
  const priceKey = currentMode === "resin" ? STORE.bottlePrice : STORE.spoolPrice;
  save(priceKey, $("material-price").value.trim());
}

function onEdit(event) {
  const target = event.target;
  if (target.name === "mode") onModeChange();
  if (target.id === "time-text") onTimeText();
  if (target.id === "time-hours" || target.id === "time-minutes") onTimeParts();
  if (target.id === "depreciation-on") $("wear-fields").hidden = !target.checked;
  if (target.name === "method") {
    $("label-percent").textContent = $("method-margin").checked ? "Margin percent" : "Markup percent";
  }
  savePrefs();
  recalc(target.id === "currency");
}

function loadExample(id) {
  const example = WORKED.find((item) => item.id === id);
  if (!example) return;
  const { mode, method, depreciation, values } = example.input;
  $("mode-filament").checked = mode !== "resin";
  $("mode-resin").checked = mode === "resin";
  onModeChange();
  $("method-markup").checked = method !== "margin";
  $("method-margin").checked = method === "margin";
  $("label-percent").textContent = method === "margin" ? "Margin percent" : "Markup percent";
  $("depreciation-on").checked = depreciation;
  $("wear-fields").hidden = !depreciation;
  for (const [key, value] of Object.entries(values)) {
    const el = $(key);
    if (!el) continue;
    el.value = value;
  }
  onTimeText();
  recalc();
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function withBusy(button, busyLabel, fn) {
  const label = button.dataset.label || button.textContent;
  button.dataset.label = label;
  button.dataset.busy = "1";
  button.disabled = true;
  button.textContent = busyLabel;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    await fn();
  } finally {
    button.dataset.busy = "0";
    button.textContent = label;
    button.disabled = button.id === "reset" ? false : !latest;
  }
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy failed");
}

function clearJob() {
  currencySticky = null;
  currencyLocked = false;
  for (const key of Object.values(STORE)) save(key, "");
  $("mode-filament").checked = true;
  currentMode = "filament";
  applyMode("filament");
  for (const id of [
    "material-price", "usage-amount", "waste-amount", "time-text", "time-hours", "time-minutes",
    "power", "electricity", "labor-minutes", "hourly-rate", "machine-price", "machine-hours",
    "other-costs", "part-name",
  ]) $(id).value = "";
  $("package-amount").value = "1";
  $("failure-rate").value = "0";
  $("price-percent").value = "50";
  $("method-markup").checked = true;
  $("label-percent").textContent = "Markup percent";
  $("depreciation-on").checked = false;
  $("wear-fields").hidden = true;
  $("currency").value = "USD";
  recalc();
}

$("calculator").addEventListener("input", onEdit);
$("calculator").addEventListener("change", onEdit);

$("copy-result").addEventListener("click", () => {
  if (!latest) return;
  const text = plainText(latest, document.querySelector("h1").textContent.trim());
  withBusy($("copy-result"), "Copying…", async () => {
    try {
      await copyText(text);
    } catch {
      const note = document.createElement("p");
      note.className = "errors";
      note.textContent = "Copy did not work. Select the result and copy it yourself.";
      $("result-body").append(note);
    }
  });
});

$("print-page").addEventListener("click", () => {
  if (!latest) return;
  withBusy($("print-page"), "Printing…", async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.print();
  });
});

$("reset").addEventListener("click", () => {
  withBusy($("reset"), "Resetting…", async () => {
    clearJob();
  });
});

for (const button of document.querySelectorAll(".load-example")) {
  button.addEventListener("click", () => {
    withBusy(button, "Loading…", async () => {
      loadExample(button.dataset.example);
    });
  });
}

$("price-bar").addEventListener("click", () => {
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.addEventListener("focusin", (event) => {
  if (event.target.matches("input, select, textarea")) document.body.classList.add("is-typing");
});
document.addEventListener("focusout", () => {
  document.body.classList.remove("is-typing");
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    $("price-bar").classList.toggle("is-covered", entries.some((entry) => entry.isIntersecting));
  }, { threshold: 0.2 });
  observer.observe($("results"));
}

const restoredPower = load(STORE.power);
const restoredElectricity = load(STORE.electricity);
const restoredHourly = load(STORE.hourly);
const restoredSpool = load(STORE.spoolPrice);
if (restoredPower) $("power").value = restoredPower;
if (restoredElectricity) $("electricity").value = restoredElectricity;
if (restoredHourly) $("hourly-rate").value = restoredHourly;
if (restoredSpool) $("material-price").value = restoredSpool;

// Values typed before this script loaded, or restored on back/forward, never fired input.
function syncRestoredFields() {
  if ($("mode-resin").checked) onModeChange();
  const timeText = $("time-text").value.trim();
  const hours = $("time-hours").value.trim();
  const minutes = $("time-minutes").value.trim();
  if (timeText) onTimeText();
  else if (hours || minutes) onTimeParts();
  $("wear-fields").hidden = !$("depreciation-on").checked;
  $("label-percent").textContent = $("method-margin").checked ? "Margin percent" : "Markup percent";
}
syncRestoredFields();
recalc();
