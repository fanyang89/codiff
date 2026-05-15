/**
 * @generated SignedSource<<f6ea54ac6f8ab72fe6ebf4737ed3344b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type AppRelayEntryPointQuery$variables = Record<PropertyKey, never>;
export type AppRelayEntryPointQuery$data = {
  readonly viewer: {
    readonly " $fragmentSpreads": FragmentRefs<"AppUserCard_user">;
  } | null | undefined;
};
export type AppRelayEntryPointQuery = {
  response: AppRelayEntryPointQuery$data;
  variables: AppRelayEntryPointQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "AppRelayEntryPointQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "AppUserCard_user"
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "AppRelayEntryPointQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "UserCaughtPokemonConnection",
            "kind": "LinkedField",
            "name": "caughtPokemon",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": "UserCaughtPokemonConnectionEdge",
                "kind": "LinkedField",
                "name": "edges",
                "plural": true,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "CaughtPokemon",
                    "kind": "LinkedField",
                    "name": "node",
                    "plural": false,
                    "selections": [
                      (v0/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "nickname",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": "Pokemon",
                        "kind": "LinkedField",
                        "name": "pokemon",
                        "plural": false,
                        "selections": [
                          {
                            "alias": null,
                            "args": null,
                            "kind": "ScalarField",
                            "name": "name",
                            "storageKey": null
                          },
                          (v0/*: any*/)
                        ],
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "shiny",
                        "storageKey": null
                      }
                    ],
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          (v0/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "a820afd8fe2b0fde5ace34f77dd0c766",
    "id": null,
    "metadata": {},
    "name": "AppRelayEntryPointQuery",
    "operationKind": "query",
    "text": "query AppRelayEntryPointQuery {\n  viewer {\n    ...AppUserCard_user\n    id\n  }\n}\n\nfragment AppUserCard_user on User {\n  caughtPokemon {\n    edges {\n      node {\n        id\n        nickname\n        pokemon {\n          name\n          id\n        }\n        shiny\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "322d95858acdfb038631ba18f1d04b98";

export default node;
