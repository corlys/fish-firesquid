// src/contract.ts
import { Store } from "@subsquid/typeorm-store";
import { ethers } from "ethers";
import WebsocketProvider from "web3-providers-ws";
import * as erc721 from "./abi/erc721";
import { astarCatsContract } from "./helper/AstarCats";
import { astarDegenscontract } from "./helper/AstarDegens";
import { Contract } from "./model";

// export const CHAIN_NODE = "wss://astar.public.blastapi.io";
export const CHAIN_NODE =
  "wss://astar.api.onfinality.io/ws?apikey=70f02ff7-58b9-4d16-818c-2bf302230f7d";
// export const CHAIN_NODE =
//   "wss://rpc.pinknode.io/moonriver/0cac53c9-2bc5-440f-9f3b-9e2307c46d60";

interface ContractInfo {
  ethersContract: ethers.Contract;
  contractModel: Contract;
}

export const contractMapping: Map<string, ContractInfo> = new Map<
  string,
  ContractInfo
>();

contractMapping.set(astarDegenscontract.address, {
  ethersContract: astarDegenscontract,
  contractModel: {
    id: astarDegenscontract.address,
    name: "AstarDegens",
    symbol: "DEGEN",
    totalSupply: 10000n,
    mintedTokens: [],
  },
});

contractMapping.set(astarCatsContract.address, {
  ethersContract: astarCatsContract,
  contractModel: {
    id: astarCatsContract.address,
    name: "AstarCats",
    symbol: "CAT",
    totalSupply: 7777n,
    mintedTokens: [],
  },
});

export function createContractEntity(address: string): Contract {
  return new Contract(contractMapping.get(address)?.contractModel);
}

const contractAddresstoModel: Map<string, Contract> = new Map<
  string,
  Contract
>();

export async function getContractEntity(
  store: Store,
  address: string
): Promise<Contract | undefined> {
  if (contractAddresstoModel.get(address) == null) {
    let contractEntity = await store.get(Contract, address);
    if (contractEntity == null) {
      contractEntity = createContractEntity(address);
      await store.insert(contractEntity);
      contractAddresstoModel.set(address, contractEntity);
    }
  }

  return contractAddresstoModel.get(address);
}

export async function getTokenURI(
  tokenId: string,
  address: string
): Promise<string> {
  return retry(async () =>
    timeout(contractMapping.get(address)?.ethersContract?.tokenURI(tokenId))
  );
}

async function timeout<T>(res: Promise<T>, seconds = 30): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: any = setTimeout(() => {
      timer = undefined;
      reject(new Error(`Request timed out in ${seconds} seconds`));
    }, seconds * 1000);

    res
      .finally(() => {
        if (timer != null) {
          clearTimeout(timer);
        }
      })
      .then(resolve, reject);
  });
}

async function retry<T>(promiseFn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await promiseFn();
    } catch (err) {
      console.log(err);
    }
  }
  throw new Error(`Error after ${attempts} attempts`);
}
