import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
} from '../generated/api';


/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
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

  const numberOfOrders = input.cart.buyerIdentity?.customer?.numberOfOrders;
  if (numberOfOrders == null) {
    return { operations: [] };
  }

  const rule = findRule(numberOfOrders, DEFAULT_CONFIG.rules);
  if (!rule) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        orderDiscountsAdd: {
          candidates: [
            {
              message: DEFAULT_CONFIG.label,
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