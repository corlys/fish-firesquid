// src/processor.ts
import { lookupArchive } from "@subsquid/archive-registry";
import { Store, TypeormDatabase } from "@subsquid/typeorm-store";
import {
  BatchContext,
  BatchProcessorItem,
  EvmLogEvent,
  SubstrateBatchProcessor,
  SubstrateBlock,
} from "@subsquid/substrate-processor";
import { In } from "typeorm";
import axios from "axios";
import {
  CHAIN_NODE,
  getContractEntity,
  getTokenURI,
  contractMapping,
} from "./contract";
import { astarCatsContract } from "./helper/AstarCats";
import { astarDegenscontract } from "./helper/AstarDegens";
import { fishContract } from "./helper/Fish";
import { fishMarketplaceContract } from "./helper/FishMarketplace";
import { Owner, Token, Transfer, Activity, ActivityType } from "./model";
import * as erc721 from "./abi/erc721";
import * as fishMarketplace from "./abi/fishMarketplace";

const database = new TypeormDatabase();
const processor = new SubstrateBatchProcessor()
  .setBatchSize(500)
  .setBlockRange({ from: 1459305 })
  .setDataSource({
    chain: CHAIN_NODE,
    archive: lookupArchive("astar", { release: "FireSquid" }),
  })
  .setTypesBundle("astar")
  .addEvmLog(fishContract.address, {
    range: { from: 1459305 },
    filter: [erc721.events["Transfer(address,address,uint256)"].topic],
  })
  .addEvmLog(fishMarketplaceContract.address, {
    range: { from: 1459307 },
    filter: [
      [
        fishMarketplace.events["SellEvent(address,uint256,uint256,address)"]
          .topic,
        fishMarketplace.events[
          "BuyEvent(address,address,uint256,uint256,uint256,address)"
        ].topic,
      ],
    ],
  });

type Item = BatchProcessorItem<typeof processor>;
type Context = BatchContext<Store, Item>;

processor.run(database, async (ctx) => {
  const transfersData: TransferData[] = [];
  const sellsData: SellData[] = [];
  const buysData: BuyData[] = [];
  // new eventData
  for (const block of ctx.blocks) {
    for (const item of block.items) {
      if (item.name === "EVM.Log") {
        console.log(
          `=======================${item.event.args.address}=========================`
        );
        if (item.event.args.address === fishMarketplaceContract.address) {
          console.log(
            "==============THERE IS AN EVENT FROM THE MARKETPLACE================"
          );
          const topics = item.event.args.topics;
          if (
            topics[0] ===
            fishMarketplace.events["SellEvent(address,uint256,uint256,address)"]
              .topic
          ) {
            const sell = handleSell(block.header, item.event);
            sellsData.push(sell);
          } else if (
            topics[0] ===
            fishMarketplace.events[
              "BuyEvent(address,address,uint256,uint256,uint256,address)"
            ].topic
          ) {
            const buy = handleBuy(block.header, item.event);
            buysData.push(buy);
          }
        }

        if (item.event.args.address === fishContract.address) {
          console.log(
            "==============THERE IS AN EVENT FROM THE NFT FISH================"
          );
          const transfer = handleTransfer(block.header, item.event);
          transfersData.push(transfer);
        }
      }
    }
  }
  await saveTransfers(ctx, transfersData);
  await saveSell(ctx, sellsData);
  await saveBuy(ctx, buysData);
});

type TransferData = {
  id: string;
  from: string;
  to: string;
  token: string;
  timestamp: bigint;
  block: number;
  transactionHash: string;
  contractAddress: string;
};

type SellData = {
  id: string;
  from: string;
  tokenId: string;
  price: bigint;
  nftContractAddress: string;
  timestamp: bigint;
  block: number;
  transactionHash: string;
  contractAddress: string;
};

type BuyData = {
  id: string;
  from: string;
  to: string;
  tokenId: string;
  price: bigint;
  buyTime: bigint;
  nftContractAddress: string;
  timestamp: bigint;
  block: number;
  transactionHash: string;
  contractAddress: string;
};

interface ITokenURI {
  image: string;
  description: string;
  name: string;
}

function handleTransfer(
  block: SubstrateBlock,
  event: EvmLogEvent
): TransferData {
  const { from, to, tokenId } = erc721.events[
    "Transfer(address,address,uint256)"
  ].decode(event.args);

  // console.log("==========EVENT TRANSFER FIRED=============");

  const transfer: TransferData = {
    id: event.id,
    token: tokenId.toString(),
    from,
    to,
    timestamp: BigInt(block.timestamp),
    block: block.height,
    transactionHash: event.evmTxHash,
    contractAddress: event.args.address,
  };
  // console.log(`${from}-${to}-${tokenId}-${event.args.address}`);
  // console.log("==========END==============END=============");
  return transfer;
}

function handleSell(block: SubstrateBlock, event: EvmLogEvent): SellData {
  const { seller, tokenId, price, NFTAddress } = fishMarketplace.events[
    "SellEvent(address,uint256,uint256,address)"
  ].decode(event.args);

  const sell: SellData = {
    id: event.id,
    tokenId: tokenId.toString(),
    from: seller,
    price: price.toBigInt(),
    nftContractAddress: NFTAddress.toLowerCase(),
    timestamp: BigInt(block.timestamp),
    block: block.height,
    transactionHash: event.evmTxHash,
    contractAddress: event.args.address,
  };

  return sell;
}

function handleBuy(block: SubstrateBlock, event: EvmLogEvent): BuyData {
  const { NFTAddress, buyer, tokenId, seller, buyTime, price } =
    fishMarketplace.events[
      "BuyEvent(address,address,uint256,uint256,uint256,address)"
    ].decode(event.args);

  const buy: BuyData = {
    id: event.id,
    tokenId: tokenId.toString(),
    from: seller,
    to: buyer,
    buyTime: buyTime.toBigInt(),
    nftContractAddress: NFTAddress.toLowerCase(),
    price: price.toBigInt(),
    timestamp: BigInt(block.timestamp),
    block: block.height,
    transactionHash: event.evmTxHash,
    contractAddress: event.args.address,
  };

  return buy;
}

async function saveTransfers(ctx: Context, transfersData: TransferData[]) {
  console.log("===================BEGIN SAVETRANSFER================");
  console.log("Transfer Data Length : ", transfersData.length);
  const tokensIds: Set<string> = new Set();
  const ownersIds: Set<string> = new Set();

  for (const transferData of transfersData) {
    tokensIds.add(
      `${
        contractMapping.get(transferData.contractAddress)?.contractModel
          .symbol || ""
      }-${transferData.token}`
    );
    ownersIds.add(transferData.from);
    ownersIds.add(transferData.to);
  }

  const transfers: Set<Transfer> = new Set();
  const activities: Set<Activity> = new Set();

  const tokens: Map<string, Token> = new Map(
    (await ctx.store.findBy(Token, { id: In([...tokensIds]) })).map((token) => [
      token.id,
      token,
    ])
  );

  const owners: Map<string, Owner> = new Map(
    (await ctx.store.findBy(Owner, { id: In([...ownersIds]) })).map((owner) => [
      owner.id,
      owner,
    ])
  );

  for (const transferData of transfersData) {
    let activityEntity: Activity | null | undefined = null;

    let from = owners.get(transferData.from);
    if (from == null) {
      from = new Owner({ id: transferData.from, balance: 0n });
      owners.set(from.id, from);
    }

    let to = owners.get(transferData.to);
    if (to == null) {
      to = new Owner({ id: transferData.to, balance: 0n });
      owners.set(to.id, to);
    }

    let token = tokens.get(
      `${
        contractMapping.get(transferData.contractAddress)?.contractModel
          .symbol || ""
      }-${transferData.token}`
    );

    console.log(
      `Token With the id of ${
        contractMapping.get(transferData.contractAddress)?.contractModel
          .symbol || ""
      }-${transferData.token} does ${token ? "exist" : "not exist"}`
    );

    if (token == null) {
      const uri = await getTokenURI(
        transferData.token,
        transferData.contractAddress
      );
      let imageUri: string;
      if (uri.includes("ipfs://")) {
        try {
          const get = await axios.get<ITokenURI>(
            uri.replace("ipfs://", "https://nftstorage.link/ipfs/")
          );
          imageUri = get.data.image;
        } catch (error) {
          imageUri = "";
        }
      } else {
        imageUri = "";
      }
      token = new Token({
        id: `${
          contractMapping.get(transferData.contractAddress)?.contractModel
            .symbol || ""
        }-${transferData.token}`,
        uri,
        contract: await getContractEntity(
          ctx.store,
          transferData.contractAddress
        ),
        imageUri,
        tokenId: parseInt(transferData.token),
        isListed: false,
      });
      tokens.set(token.id, token);

      activityEntity = await ctx.store.get(
        Activity,
        transferData.contractAddress +
          "-" +
          transferData.transactionHash +
          "-" +
          transferData.token +
          "-" +
          ActivityType.MINT
      );

      console.log("Making minting activity");
      if (activityEntity == null) {
        activityEntity = new Activity({
          id:
            transferData.contractAddress +
            "-" +
            transferData.transactionHash +
            "-" +
            transferData.token +
            "-" +
            ActivityType.MINT,
          type: ActivityType.MINT,
          block: transferData.block,
          from,
          timestamp: transferData.timestamp,
          token,
          transactionHash: transferData.transactionHash,
        });
        activities.add(activityEntity);
      }
    } else {
      token.isListed = false;
    }
    token.owner = to;

    const { id, block, transactionHash, timestamp } = transferData;

    const transfer = new Transfer({
      id,
      block,
      timestamp,
      transactionHash,
      from,
      to,
      token,
    });

    transfers.add(transfer);
    console.log(
      `Hey Token ${transferData.token} ini activity sebelum buat transfer ${activityEntity?.type}`
    );
    if (activityEntity == null) {
      activityEntity = await ctx.store.get(
        Activity,
        transferData.contractAddress +
          "-" +
          transferData.transactionHash +
          "-" +
          transferData.token +
          "-" +
          ActivityType.TRANSFER
      );

      if (activityEntity == null) {
        activityEntity = new Activity({
          id:
            transferData.contractAddress +
            "-" +
            transferData.transactionHash +
            "-" +
            transferData.token +
            "-" +
            ActivityType.TRANSFER,
          type: ActivityType.TRANSFER,
          block: transferData.block,
          from,
          timestamp: transferData.timestamp,
          token,
          transactionHash: transferData.transactionHash,
        });
        activities.add(activityEntity);
      }
    }
  }

  await ctx.store.save([...owners.values()]);
  await ctx.store.save([...tokens.values()]);
  await ctx.store.save([...transfers]);
  await ctx.store.save([...activities]);

  console.log("===================END SAVETRANSFER================");
}

async function saveSell(ctx: Context, sellsData: SellData[]) {
  console.log(sellsData);

  const tokensIds: Set<string> = new Set();
  const ownersIds: Set<string> = new Set();

  for (const sellData of sellsData) {
    tokensIds.add(
      `${
        contractMapping.get(sellData.nftContractAddress)?.contractModel
          .symbol || ""
      }-${sellData.tokenId}`
    );
    ownersIds.add(sellData.from);
    // ownersIds.add(sellData.to);
  }

  const activities: Set<Activity> = new Set();

  const tokens: Map<string, Token> = new Map(
    (await ctx.store.findBy(Token, { id: In([...tokensIds]) })).map((token) => [
      token.id,
      token,
    ])
  );

  const owners: Map<string, Owner> = new Map(
    (await ctx.store.findBy(Owner, { id: In([...ownersIds]) })).map((owner) => [
      owner.id,
      owner,
    ])
  );

  for (const sellData of sellsData) {
    let from = owners.get(sellData.from);
    if (from == null) {
      from = new Owner({ id: sellData.from, balance: 0n });
      owners.set(from.id, from);
    }

    let token = tokens.get(
      `${
        contractMapping.get(sellData.nftContractAddress)?.contractModel
          .symbol || ""
      }-${sellData.tokenId}`
    );

    if (token == null) {
      const uri = await getTokenURI(
        sellData.tokenId,
        sellData.nftContractAddress
      );
      let imageUri: string;
      if (uri.includes("ipfs://")) {
        try {
          const get = await axios.get<ITokenURI>(
            uri.replace("ipfs://", "https://nftstorage.link/ipfs/")
          );
          imageUri = get.data.image;
        } catch (error) {
          imageUri = "";
        }
      } else {
        imageUri = "";
      }
      token = new Token({
        id: `${
          contractMapping.get(sellData.nftContractAddress)?.contractModel
            .symbol || ""
        }-${sellData.tokenId}`,
        uri,
        contract: await getContractEntity(
          ctx.store,
          sellData.nftContractAddress
        ),
        imageUri,
        tokenId: parseInt(sellData.tokenId),
        isListed: true,
      });
      tokens.set(token.id, token);

      let mintActivity = await ctx.store.get(
        Activity,
        sellData.nftContractAddress +
          "-" +
          sellData.transactionHash +
          "-" +
          sellData.tokenId +
          "-" +
          ActivityType.MINT
      );

      if (mintActivity == null) {
        mintActivity = new Activity({
          id:
            sellData.nftContractAddress +
            "-" +
            sellData.transactionHash +
            "-" +
            sellData.tokenId +
            "-" +
            ActivityType.MINT,
          type: ActivityType.MINT,
          block: sellData.block,
          from,
          timestamp: sellData.timestamp,
          token,
          transactionHash: sellData.transactionHash,
        });
        activities.add(mintActivity);
      }
    } else {
      token.isListed = true;
    }
    token.owner = from;

    const {
      block,
      price,
      timestamp,
      transactionHash,
      tokenId,
      nftContractAddress,
    } = sellData;

    const sellActivity = new Activity({
      id:
        nftContractAddress +
        "-" +
        transactionHash +
        "-" +
        tokenId +
        "-" +
        ActivityType.LISTING,
      type: ActivityType.LISTING,
      block: block,
      from,
      price: price,
      timestamp: timestamp,
      token,
      transactionHash: transactionHash,
    });

    activities.add(sellActivity);
  }

  await ctx.store.save([...owners.values()]);
  await ctx.store.save([...tokens.values()]);
  await ctx.store.save([...activities]);
}

async function saveBuy(ctx: Context, buysData: BuyData[]) {
  const tokensIds: Set<string> = new Set();
  const ownersIds: Set<string> = new Set();

  for (const buyData of buysData) {
    tokensIds.add(
      `${
        contractMapping.get(buyData.nftContractAddress)?.contractModel.symbol ||
        ""
      }-${buyData.tokenId}`
    );
    ownersIds.add(buyData.from);
    ownersIds.add(buyData.to);
  }

  const activities: Set<Activity> = new Set();

  const tokens: Map<string, Token> = new Map(
    (await ctx.store.findBy(Token, { id: In([...tokensIds]) })).map((token) => [
      token.id,
      token,
    ])
  );

  const owners: Map<string, Owner> = new Map(
    (await ctx.store.findBy(Owner, { id: In([...ownersIds]) })).map((owner) => [
      owner.id,
      owner,
    ])
  );

  for (const buyData of buysData) {
    let from = owners.get(buyData.from);
    if (from == null) {
      from = new Owner({ id: buyData.from, balance: 0n });
      owners.set(from.id, from);
    }

    let to = owners.get(buyData.to);
    if (to == null) {
      to = new Owner({ id: buyData.to, balance: 0n });
      owners.set(to.id, to);
    }

    let token = tokens.get(
      `${
        contractMapping.get(buyData.nftContractAddress)?.contractModel.symbol ||
        ""
      }-${buyData.tokenId}`
    );

    if (token != null) {
      // In Buy Event token must already exist
      token.owner = from;
      token.isListed = false;
    }

    const {
      nftContractAddress,
      transactionHash,
      block,
      price,
      timestamp,
      tokenId,
    } = buyData;

    const buyActivity = new Activity({
      id:
        nftContractAddress +
        "-" +
        transactionHash +
        "-" +
        tokenId +
        "-" +
        ActivityType.SOLD,
      type: ActivityType.SOLD,
      block: block,
      to,
      from,
      price: price,
      timestamp: timestamp,
      token,
      transactionHash: transactionHash,
    });

    activities.add(buyActivity);
  }

  await ctx.store.save([...owners.values()]);
  await ctx.store.save([...tokens.values()]);
  await ctx.store.save([...activities]);
}
