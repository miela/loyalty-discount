import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
} from '../generated/api';


/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 * @typedef {{minOrders: number, maxOrders?: number, percentage: number}} Rule
 * @typedef {{label: string, rules: Rule[]}} Config
 */

const DEFAULT_CONFIG = {
  label: 'Loyal Customer Discount',
  rules: [
    { minOrders: 2, maxOrders: 2, percentage: 13 },
    { minOrders: 4, percentage: 50 },
  ],
};


/**
 * Returns the first rule matching the customer's previous order count.
 * @param {number} numberOfOrders
 * @param {Array<{minOrders: number, maxOrders?: number, percentage: number}>} rules
 * @returns {{minOrders: number, maxOrders?: number, percentage: number} | null}
 */
function findRule(numberOfOrders, rules) {
  return (
    rules.find(
      (rule) =>
        numberOfOrders >= rule.minOrders &&
        numberOfOrders <= (rule.maxOrders ?? Infinity),
    ) ?? null
  );
}

/**
 * Checks whether a single rule from the metafield has a usable shape.
 * @param {any} rule
 * @returns {boolean}
 */
function isValidRule(rule) {
  if (!rule || !Number.isInteger(rule.minOrders) || rule.minOrders < 0) {
    return false;
  }
  if (
    rule.maxOrders != null &&
    (!Number.isInteger(rule.maxOrders) || rule.maxOrders < rule.minOrders)
  ) {
    return false;
  }
  return (
    typeof rule.percentage === 'number' &&
    rule.percentage > 0 &&
    rule.percentage <= 100
  );
}

/**
 * Returns config from the discount metafield, or defaults if it's missing or invalid.
 * @param {any} jsonValue
 * @returns {{label: string, rules: Array<{minOrders: number, maxOrders?: number, percentage: number}>}}
 */
function readConfig(jsonValue) {
  const rules = jsonValue?.rules;
  if (!Array.isArray(rules) || rules.length === 0 || !rules.every(isValidRule)) {
    return DEFAULT_CONFIG;
  }

  const label =
    typeof jsonValue.label === 'string' && jsonValue.label.trim()
      ? jsonValue.label.trim()
      : DEFAULT_CONFIG.label;

  return { label, rules };
}

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const hasOrderDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Order,
  );
  if (!hasOrderDiscountClass) {
    return { operations: [] };
  }

  const config = readConfig(input.discount.metafield?.jsonValue);

  const numberOfOrders = input.cart.buyerIdentity?.customer?.numberOfOrders;
  if (numberOfOrders == null) {
    return { operations: [] };
  }

  const rule = findRule(numberOfOrders, config.rules);
  if (!rule) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        orderDiscountsAdd: {
          candidates: [
            {
              message: config.label,
              targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
              value: { percentage: { value: rule.percentage } },
            },
          ],
          selectionStrategy: OrderDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}