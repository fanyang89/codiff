/**
 * @generated SignedSource<<f76b426cb966a3b1a0e2a6ebb25e7a1e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type AppUserCard_user$data = {
  readonly caughtPokemon: {
    readonly edges: ReadonlyArray<{
      readonly node: {
        readonly id: string;
        readonly nickname: string | null | undefined;
        readonly pokemon: {
          readonly name: string;
        } | null | undefined;
        readonly shiny: boolean;
      } | null | undefined;
    } | null | undefined> | null | undefined;
  };
  readonly " $fragmentType": "AppUserCard_user";
};
export type AppUserCard_user$key = {
  readonly " $data"?: AppUserCard_user$data;
  readonly " $fragmentSpreads": FragmentRefs<"AppUserCard_user">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "AppUserCard_user",
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
                {
                  "alias": null,
                  "args": null,
                  "kind": "ScalarField",
                  "name": "id",
                  "storageKey": null
                },
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
                    }
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
    }
  ],
  "type": "User",
  "abstractKey": null
};

(node as any).hash = "c8627851338a6c2acd67b6954da35a97";

export default node;
