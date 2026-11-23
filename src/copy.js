/** Fixed English copy. v1 is English only. */

export const TOOL_HOME = "3D Print Cost Calculator";
export const TOOL_SYNONYM = "3D Printing Cost Calculator";

export const HOME_DESCRIPTION =
  "Estimate the cost of one 3D print from material, print time, and electricity, then see a suggested price from markup or margin.";

export const SYNONYM_DESCRIPTION =
  "Estimate 3D printing cost for one part from filament or resin, watts, and your electricity price. Markup and margin stay separate.";

export const LEDE =
  "Estimate the cost of one 3D print, then turn that cost into a suggested price.";

export const PRIVACY =
  "Your numbers stay in this browser. Nothing is uploaded.";

export const DISCLAIMER =
  "This is an estimate from the numbers you entered. It is not financial, tax, or legal advice. The suggested price is only a simple figure calculated from your cost. It is not a price you have to charge.";

export const MARKUP_NOTE =
  "Markup adds a percent on top of cost. 50% markup means the price is cost × 1.5.";

export const MARGIN_NOTE =
  "Margin is the share of the selling price you keep. 40% margin means the price is cost ÷ 0.6.";

export const HOW_TIME =
  "Paste Print time, or type Hours and Minutes, then enter Power (W) and Electricity price.";

export const HOW_KEEP =
  "Press Copy result or Print when you want to keep the numbers.";

export const SLICER_HINT =
  "A slicer is the program that turns a 3D file into printer instructions. Paste the weight and the time it shows.";

export function slicerHint(mode) {
  if (mode === "resin") {
    return "A slicer is the program that turns a 3D file into printer instructions. Paste the volume and the time it shows.";
  }
  return SLICER_HINT;
}

export const KWH_HINT =
  "A kWh (kilowatt-hour) is one kilowatt used for one hour. Enter the price of one kWh.";

export const WATT_HINT =
  "Watts (W) measure how much electricity the printer draws while it runs.";

export const FAILURE_HINT =
  "Out of 100 prints, this is how many fail. The successful prints share that cost. 100 is not allowed.";

export const WEAR_HINT =
  "Machine wear is the machine price divided by the hours you expect it to print, times this job's hours.";

export const TIME_HINT = "Enter a time like 5h 23m, 5:23, or 323 min.";

export const PRICE_HINT =
  "You can paste a symbol, such as $22.99 or NT$590. The symbol is not a currency conversion.";

export const CURRENCY_HINT =
  "This only changes the symbol and how amounts are written. Amounts are not converted.";

export const EMPTY_RESULT =
  "Enter the missing items. Nothing is calculated until they are filled in.";

export const FEEDBACK_EMAIL = "alan.chang198807@gmail.com";

const MATERIAL_LABELS = {
  filament: {
    price: "Spool price",
    pack: "Spool weight",
    usage: "Print weight",
  },
  resin: {
    price: "Bottle price",
    pack: "Bottle volume",
    usage: "Print volume",
  },
};

export function materialLabels(mode) {
  return MATERIAL_LABELS[mode] || MATERIAL_LABELS.filament;
}

export function howMaterial(mode) {
  const labels = materialLabels(mode);
  return `Choose Filament or Resin, then fill in ${labels.price}, ${labels.pack}, and ${labels.usage}.`;
}
