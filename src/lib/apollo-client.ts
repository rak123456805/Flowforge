import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  split,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient as createWsClient } from "graphql-ws";
import { nhost } from "./nhost";

const GRAPHQL_URL =
  process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL ??
  `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION ?? "eu-central-1"}.nhost.run/v1/graphql`;

const WS_URL = GRAPHQL_URL.replace(/^http/, "ws");

// ── HTTP Link ──────────────────────────────────────────────────────────────
const httpLink = createHttpLink({ uri: GRAPHQL_URL });

const authLink = setContext(async (_, { headers }) => {
  const token = nhost.auth.getAccessToken();
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

// ── WebSocket Link (client-only) ───────────────────────────────────────────
function createWsLink() {
  return new GraphQLWsLink(
    createWsClient({
      url: WS_URL,
      connectionParams: () => {
        const token = nhost.auth.getAccessToken();
        return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      },
      retryAttempts: 5,
      shouldRetry: () => true,
    })
  );
}

// ── Conditional split (subscriptions via WS, rest via HTTP) ───────────────
function createSplitLink() {
  if (typeof window === "undefined") {
    // SSR: no WebSocket
    return authLink.concat(httpLink);
  }
  const wsLink = createWsLink();
  return split(
    ({ query }) => {
      const def = getMainDefinition(query);
      return def.kind === "OperationDefinition" && def.operation === "subscription";
    },
    wsLink,
    authLink.concat(httpLink)
  );
}

export const apolloClient = new ApolloClient({
  link: createSplitLink(),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          workflow_runs: { merge: false },
          step_runs: { merge: false },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: { fetchPolicy: "cache-and-network" },
  },
});
