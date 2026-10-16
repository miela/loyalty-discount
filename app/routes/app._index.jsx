import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const FUNCTION_HANDLE = "order-history-discount";
const METAFIELD_NAMESPACE = "$app:loyalty-discount";
const METAFIELD_KEY = "function-configuration";

const DEFAULT_CONFIG = {
  label: "Loyal Customer Discount",
  rules: [
    { minOrders: 2, maxOrders: 2, percentage: 13 },
    { minOrders: 4, percentage: 50 },
  ],
};

async function findLoyaltyDiscount(admin) {
  const response = await admin.graphql(
    `#graphql
    query LoyaltyDiscount {
      shopifyFunctions(first: 25) {
        nodes { id handle }
      }
      discountNodes(first: 50) {
        nodes {
          id
          config: metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
            jsonValue
          }
          discount {
            ... on DiscountAutomaticApp {
              title
              status
              appDiscountType { functionId }
            }
          }
        }
      }
    }`,
  );
  const { data } = await response.json();

  const fn = data.shopifyFunctions.nodes.find(
    (f) => f.handle === FUNCTION_HANDLE,
  );
  return (
    data.discountNodes.nodes.find(
      (n) => n.discount.appDiscountType?.functionId === fn?.id,
    ) ?? null
  );
}

function toInt(value) {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
}

function parseConfig(form) {
  const errors = [];
  const label = String(form.get("label") ?? "").trim() || DEFAULT_CONFIG.label;

  const rules = [1, 2].map((tier) => {
    const minOrders = toInt(form.get(`tier${tier}Min`));
    const maxOrders = toInt(form.get(`tier${tier}Max`));
    const percentage = Number(form.get(`tier${tier}Percentage`));

    if (!Number.isInteger(minOrders) || minOrders < 0) {
      errors.push(`Tier ${tier}: "From" must be a whole number, 0 or more.`);
    }
    if (
      maxOrders !== null &&
      (!Number.isInteger(maxOrders) || maxOrders < minOrders)
    ) {
      errors.push(`Tier ${tier}: "To" must be empty or not lower than "From".`);
    }
    if (!(percentage > 0 && percentage <= 100)) {
      errors.push(`Tier ${tier}: discount must be between 1 and 100%.`);
    }

    return maxOrders === null
      ? { minOrders, percentage }
      : { minOrders, maxOrders, percentage };
  });

  const [tier1, tier2] = rules;
  if (
    errors.length === 0 &&
    (tier1.maxOrders === undefined || tier1.maxOrders >= tier2.minOrders)
  ) {
    errors.push("Tier 1 must end before Tier 2 starts.");
  }

  return { config: { label, rules }, errors };
}

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const { config, errors } = parseConfig(await request.formData());
  if (errors.length > 0) return { errors };

  const metafield = {
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEY,
    type: "json",
    value: JSON.stringify(config),
  };
  const existing = await findLoyaltyDiscount(admin);

  if (existing) {
    const response = await admin.graphql(
      `#graphql
      mutation SaveLoyaltyConfig($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
      { variables: { metafields: [{ ...metafield, ownerId: existing.id }] } },
    );
    const { data } = await response.json();
    const userErrors = data.metafieldsSet.userErrors;
    return userErrors.length
      ? { errors: userErrors.map((e) => e.message) }
      : { ok: true };
  }

  const response = await admin.graphql(
    `#graphql
    mutation CreateLoyaltyDiscount($discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $discount) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        discount: {
          title: DEFAULT_CONFIG.label,
          functionHandle: FUNCTION_HANDLE,
          discountClasses: ["ORDER"],
          startsAt: new Date().toISOString(),
          combinesWith: {
            orderDiscounts: false,
            productDiscounts: false,
            shippingDiscounts: true,
          },
          metafields: [metafield],
        },
      },
    },
  );
  const { data } = await response.json();
  const userErrors = data.discountAutomaticAppCreate.userErrors;
  return userErrors.length
    ? { errors: userErrors.map((e) => e.message) }
    : { ok: true };
};

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const node = await findLoyaltyDiscount(admin);

  return {
    discount: node
      ? {
          id: node.id,
          title: node.discount.title,
          status: node.discount.status,
        }
      : null,
    config: node?.config?.jsonValue ?? DEFAULT_CONFIG,
  };
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export default function Index() {
  const { discount, config } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [tier1 = {}, tier2 = {}] = config.rules ?? [];
  const errors = fetcher.data?.errors ?? [];
  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok) shopify.toast.show("Settings saved");
  }, [fetcher.data, shopify]);

  const handleSubmit = (event) => {
    event.preventDefault();
    fetcher.submit(new FormData(event.currentTarget), { method: "post" });
  };

  return (
    <s-page heading="Loyalty discount">
      <form data-save-bar onSubmit={handleSubmit}>
        <s-stack gap="base">
          <s-section heading="Status">
            {discount ? (
              <s-paragraph>
                {discount.title}: <s-badge>{discount.status}</s-badge>
              </s-paragraph>
            ) : (
              <s-banner tone="info">
                The discount doesn't exist yet. Saving this form will create it.
              </s-banner>
            )}
          </s-section>

          {errors.length > 0 && (
            <s-banner tone="critical" heading="Settings not saved">
              <s-unordered-list>
                {errors.map((error) => (
                  <s-list-item key={error}>{error}</s-list-item>
                ))}
              </s-unordered-list>
            </s-banner>
          )}

          <s-section heading="Checkout label">
            <s-text-field
              label="Label shown in checkout"
              name="label"
              defaultValue={config.label}
            />
          </s-section>

          <s-section heading="Tier 1">
            <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
              <s-number-field
                label="From (previous orders)"
                name="tier1Min"
                min={0}
                defaultValue={String(tier1.minOrders ?? "")}
              />
              <s-number-field
                label="To (previous orders)"
                name="tier1Max"
                min={0}
                defaultValue={String(tier1.maxOrders ?? "")}
              />
              <s-number-field
                label="Discount"
                name="tier1Percentage"
                suffix="%"
                min={1}
                max={100}
                defaultValue={String(tier1.percentage ?? "")}
              />
            </s-grid>
          </s-section>

          <s-section heading="Tier 2">
            <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
              <s-number-field
                label="From (previous orders)"
                name="tier2Min"
                min={0}
                defaultValue={String(tier2.minOrders ?? "")}
              />
              <s-number-field
                label="To (previous orders)"
                name="tier2Max"
                min={0}
                details="Leave empty for no upper limit"
                defaultValue={String(tier2.maxOrders ?? "")}
              />
              <s-number-field
                label="Discount"
                name="tier2Percentage"
                suffix="%"
                min={1}
                max={100}
                defaultValue={String(tier2.percentage ?? "")}
              />
            </s-grid>
          </s-section>

          <s-section>
            <s-button
              type="submit"
              variant="primary"
              {...(isSaving ? { loading: true } : {})}
            >
              {discount ? "Save" : "Create discount"}
            </s-button>
          </s-section>
        </s-stack>
      </form>
    </s-page>
  );
}
