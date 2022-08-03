import { ethers } from "ethers";
import * as erc721 from "../abi/erc721";
import * as nftFish from "../abi/nftFish";
import WebsocketProvider from "web3-providers-ws";

// export const CHAIN_NODE = "wss://astar.public.blastapi.io";
export const CHAIN_NODE = "wss://rpc.pinknode.io/astar/0cac53c9-2bc5-440f-9f3b-9e2307c46d60"
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

export const fishContract = new ethers.Contract(
  "0x5cfcDD7d59e8E3A7435E9E8e568714facE5eB101".toLowerCase(),
  nftFish.abi,
  w3sProvider
);
