import { ethers } from "ethers";
import * as fishMarketplace from "../abi/fishMarketplace";
import WebsocketProvider from "web3-providers-ws";

// export const CHAIN_NODE = "wss://astar.public.blastapi.io";
export const CHAIN_NODE =
  "wss://astar.api.onfinality.io/ws?apikey=70f02ff7-58b9-4d16-818c-2bf302230f7d";
// export const CHAIN_NODE =
//   "wss://rpc.pinknode.io/moonriver/0cac53c9-2bc5-440f-9f3b-9e2307c46d60";

// @ts-ignore It appears default export is required otherwise it throws 'WebsocketProvider is not a constructor error', the typings says otherwise but well ...
const w3s = new WebsocketProvider(CHAIN_NODE, {
  timeout: 30 * 10 ** 3,
  clientConfig: {
    // Useful to keep a connection alive
    keepalive: true,
    keepaliveInterval: 20 * 10 ** 3, // ms
  },
  reconnect: {
    auto: true,
    delay: 5 * 10 ** 3,
  },
});

let w3sProvider = new ethers.providers.Web3Provider(w3s);

export const fishMarketplaceContract = new ethers.Contract(
  "0x5361ea4aC16458d83579e197DE1649e31f8529eD".toLowerCase(),
  fishMarketplace.abi,
  w3sProvider
);
