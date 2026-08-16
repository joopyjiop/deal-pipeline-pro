// In-house underwriting math (pure TypeScript, no Convex or Mongo imports).
//
// Shared by the ARV/repairs estimator in mongodb.ts and the agent-team
// underwriting agent. Every model is explicit-input driven: when key data is
// missing (rent comps, property taxes, insurance, comps, square feet, loan
// terms) the module reports a data gap instead of inventing a number. Standard
// operating ratios that are genuinely owner-independent (vacancy, management,
// maintenance) default to conservative values and are always listed as
// assumptions.

export type DataGap = {
  category: string;
  detail: string;
  blocksReady: boolean;
};

export type RepairTier = "BASE" | "MEDIUM" | "GUT";

export function median(values: number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

// Repair estimate by tier ($/SF): BASE $15, MEDIUM $30, GUT $50. Pre-1960
// properties carry a 10% age adjustment. Output shape mirrors the historic
// DealProof estimator so existing callers keep the same contract.
export function repairEstimate(squareFeet: number, tier: RepairTier, yearBuilt?: number) {
  const tierRate = { BASE: 15, MEDIUM: 30, GUT: 50 }[tier];
  const ageAdjustment = yearBuilt !== undefined && yearBuilt < 1960 ? 1.1 : 1;
  const base = squareFeet * tierRate * ageAdjustment;
  const items = {
    roof: Math.round(base * 0.2),
    hvac: Math.round(base * 0.15),
    kitchen: Math.round(base * 0.2),
    bath: Math.round(base * 0.1),
    flooring: Math.round(base * 0.12),
    paint: Math.round(base * 0.08),
    electrical: Math.round(base * 0.05),
  };
  const subtotal = Object.values(items).reduce((total, value) => total + value, 0);
  const contingency = Math.round(subtotal * 0.1);
  return { items, subtotal, contingency, total: subtotal + contingency, ratePerSquareFoot: tierRate * ageAdjustment };
}

// ARV scenarios from sold comp prices: conservative 90%, median 100%,
// aggressive 110% of the comp median. No comps -> undefined (never guessed).
export function arvFromComps(compPrices: number[]) {
  const compValues = compPrices.filter((value) => value > 0);
  const compMedian = median(compValues);
  if (compMedian === undefined) return undefined;
  return {
    compCount: compValues.length,
    compMedian,
    conservative: Math.round(compMedian * 0.9),
    median: Math.round(compMedian),
    aggressive: Math.round(compMedian * 1.1),
  };
}

// Standard monthly principal + interest payment for a fixed-rate loan.
export function amortizedPayment(principal: number, annualRatePct: number, termYears: number) {
  const monthlyRate = annualRatePct / 100 / 12;
  const periods = termYears * 12;
  if (monthlyRate === 0) return principal / Math.max(periods, 1);
  const factor = Math.pow(1 + monthlyRate, periods);
  return (principal * monthlyRate * factor) / (factor - 1);
}

export type RentalUnderwritingInput = {
  // Price basis for cap rate and loan derivation (MAO or contract price).
  purchasePrice: number;
  // Monthly rent comparables. Required unless marketRentPerSqFt + squareFeet
  // are provided as an explicit fallback (listed as an assumption).
  rentComps?: number[];
  marketRentPerSqFt?: number;
  squareFeet?: number;
  // Required for an honest NOI; missing values block the model.
  annualPropertyTax?: number;
  annualInsurance?: number;
  // Operating ratios. Defaults are conservative and always listed as
  // assumptions so the owner can replace them with market data.
  managementPct?: number;
  vacancyPct?: number;
  maintenancePct?: number;
  // Debt service inputs. Missing rate or term blocks DSCR and cash flow but
  // still allows NOI and cap rate.
  loanAmount?: number;
  loanToValuePct?: number;
  interestRatePct?: number;
  loanTermYears?: number;
};

export type RentalUnderwritingResult = {
  status: "READY" | "PARTIAL" | "BLOCKED";
  rentEstimate?: number;
  grossAnnualRent?: number;
  vacancyAmount?: number;
  effectiveGrossIncome?: number;
  operatingExpenses: {
    propertyTax?: number;
    insurance?: number;
    management?: number;
    maintenance?: number;
  };
  totalOperatingExpenses?: number;
  netOperatingIncome?: number;
  debtService: { monthly?: number; annual?: number };
  dscr?: number;
  capRate?: number;
  annualCashFlow?: number;
  monthlyCashFlow?: number;
  assumptions: string[];
  dataGaps: DataGap[];
};

export function rentalUnderwriting(input: RentalUnderwritingInput): RentalUnderwritingResult {
  const assumptions: string[] = [];
  const dataGaps: DataGap[] = [];

  // Rent estimate: comp median is the only primary evidence. The per-SF
  // fallback is an explicit assumption and never treated as verified.
  let rentEstimate: number | undefined;
  const rentCompValues = (input.rentComps ?? []).filter((value) => value > 0);
  if (rentCompValues.length > 0) {
    rentEstimate = median(rentCompValues);
  } else if (typeof input.marketRentPerSqFt === "number" && input.marketRentPerSqFt > 0 && typeof input.squareFeet === "number" && input.squareFeet > 0) {
    rentEstimate = Math.round(input.marketRentPerSqFt * input.squareFeet);
    assumptions.push("Rent derived from market rent per square foot, not rent comps.");
  } else {
    dataGaps.push({
      category: "RENT_COMPS",
      detail: "No monthly rent comparables and no market rent per square foot were provided. Rent and cash flow cannot be estimated.",
      blocksReady: true,
    });
  }

  const vacancyPct = input.vacancyPct ?? 5;
  const managementPct = input.managementPct ?? 8;
  const maintenancePct = input.maintenancePct ?? 5;
  if (input.vacancyPct === undefined) assumptions.push(`Vacancy assumed at ${vacancyPct}%.`);
  if (input.managementPct === undefined) assumptions.push(`Property management assumed at ${managementPct}%.`);
  if (input.maintenancePct === undefined) assumptions.push(`Maintenance/capex reserve assumed at ${maintenancePct}%.`);

  if (input.annualPropertyTax === undefined || input.annualPropertyTax < 0) {
    dataGaps.push({
      category: "PROPERTY_TAX",
      detail: "Annual property tax is required for an honest net operating income. Check the county assessor/tax record.",
      blocksReady: true,
    });
  }
  // Insurance is deliberately excluded from wholesale readiness: a wholesaler
  // assigns the contract and never holds the property, so no premium is carried.
  // If one is provided it still feeds a more precise NOI; otherwise it is
  // recorded as an explicit assumption and NOI uses $0.
  const insuranceAnnual = input.annualInsurance === undefined ? 0 : Math.max(0, input.annualInsurance);
  if (input.annualInsurance === undefined || input.annualInsurance < 0) {
    assumptions.push("Insurance excluded — a wholesaler does not hold the property.");
  }

  const grossAnnualRent = rentEstimate === undefined ? undefined : rentEstimate * 12;
  const vacancyAmount = grossAnnualRent === undefined ? undefined : Math.round(grossAnnualRent * vacancyPct / 100);
  const effectiveGrossIncome = grossAnnualRent === undefined || vacancyAmount === undefined ? undefined : grossAnnualRent - vacancyAmount;

  const management = effectiveGrossIncome === undefined ? undefined : Math.round(effectiveGrossIncome * managementPct / 100);
  const maintenance = effectiveGrossIncome === undefined ? undefined : Math.round(effectiveGrossIncome * maintenancePct / 100);
  const operatingExpenses = {
    propertyTax: input.annualPropertyTax,
    insurance: insuranceAnnual,
    management,
    maintenance,
  };
  const totalOperatingExpenses = [input.annualPropertyTax, insuranceAnnual, management, maintenance].every((value) => typeof value === "number")
    ? Math.round((input.annualPropertyTax ?? 0) + insuranceAnnual + (management ?? 0) + (maintenance ?? 0))
    : undefined;
  const netOperatingIncome = effectiveGrossIncome === undefined || totalOperatingExpenses === undefined
    ? undefined
    : Math.round(effectiveGrossIncome - totalOperatingExpenses);

  // Debt service: derive loan amount from LTV (assumption) when not explicit.
  let loanAmount = input.loanAmount;
  if (loanAmount === undefined || loanAmount <= 0) {
    const ltv = input.loanToValuePct ?? 75;
    loanAmount = input.purchasePrice > 0 ? Math.round(input.purchasePrice * ltv / 100) : undefined;
    if (input.loanAmount === undefined && loanAmount !== undefined) {
      assumptions.push(`Loan amount derived from ${ltv}% loan-to-value.`);
    }
  }
  const hasRate = typeof input.interestRatePct === "number" && input.interestRatePct >= 0;
  const hasTerm = typeof input.loanTermYears === "number" && input.loanTermYears > 0;
  if (!hasRate || !hasTerm) {
    dataGaps.push({
      category: "LOAN_TERMS",
      detail: "Interest rate and loan term are required for a debt service coverage ratio (DSCR) and cash flow.",
      blocksReady: false,
    });
  }
  const monthly = loanAmount !== undefined && loanAmount > 0 && hasRate && hasTerm
    ? Math.round(amortizedPayment(loanAmount, input.interestRatePct ?? 0, input.loanTermYears ?? 0))
    : undefined;
  const annual = monthly === undefined ? undefined : monthly * 12;

  const dscr = netOperatingIncome !== undefined && annual !== undefined && annual > 0
    ? Math.round((netOperatingIncome / annual) * 100) / 100
    : undefined;
  const capRate = netOperatingIncome !== undefined && input.purchasePrice > 0
    ? Math.round((netOperatingIncome / input.purchasePrice) * 10000) / 100
    : undefined;
  const annualCashFlow = netOperatingIncome !== undefined && annual !== undefined
    ? Math.round(netOperatingIncome - annual)
    : undefined;
  const monthlyCashFlow = annualCashFlow === undefined ? undefined : Math.round(annualCashFlow / 12);

  const blockedGaps = dataGaps.filter((gap) => gap.blocksReady);
  const status: RentalUnderwritingResult["status"] = blockedGaps.length > 0
    ? "BLOCKED"
    : dscr !== undefined
      ? "READY"
      : "PARTIAL";

  return {
    status,
    rentEstimate,
    grossAnnualRent,
    vacancyAmount,
    effectiveGrossIncome,
    operatingExpenses,
    totalOperatingExpenses,
    netOperatingIncome,
    debtService: { monthly, annual },
    dscr,
    capRate,
    annualCashFlow,
    monthlyCashFlow,
    assumptions,
    dataGaps,
  };
}
