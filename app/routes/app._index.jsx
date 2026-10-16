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

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

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

  const fn = data.shopifyFunctions.nodes.find((f) => f.handle === FUNCTION_HANDLE);
  const node = data.discountNodes.nodes.find(
    (n) => n.discount.appDiscountType?.functionId === fn?.id,
  );

  return {
    discount: node
      ? { id: node.id, title: node.discount.title, status: node.discount.status }
      : null,
    config: node?.config?.jsonValue ?? DEFAULT_CONFIG,
  };
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export default function Index() {
  const { discount, config } = useLoaderData();
  return (
    <s-page heading="Loyalty discount">
      <s-section>
        <pre>{JSON.stringify({ discount, config }, null, 2)}</pre>
      </s-section>
    </s-page>
  );
}