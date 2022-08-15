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
import { TransferData, BuyData, SellData, ITokenURI, TicketMintData, DevTicketMintData  } from "./types"
import { handleActivity  } from "./operator"
import { fishContract } from "./helper/Fish";
import { fishMarketplaceContract } from "./helper/FishMarketplace";
import { ticketPassAContract } from "./helper/TicketPassA";
import { Owner, Token, Transfer, Activity, ActivityType } from "./model";
import * as erc721 from "./abi/erc721";
import * as fishMarketplace from "./abi/fishMarketplace";
import * as nftFish from "./abi/nftFish";
import * as ticketPassA from "./abi/ticketPassA"

const database = new TypeormDatabase();
const processor = new SubstrateBatchProcessor()
  .setBatchSize(500)
  .setBlockRange({ from: 1620415 })
  .setDataSource({
    chain: CHAIN_NODE,
    archive: lookupArchive("astar", { release: "FireSquid" }),
  })
  .setTypesBundle("astar")
  .addEvmLog(ticketPassAContract.address, {
    range: { from: 1620415 },
    filter: [
      [
        ticketPassA.events["Transfer(address,address,uint256)"].topic,
        ticketPassA.events["DevMintEvent(uint256,address,uint256)"].topic,
        ticketPassA.events["MintEvent(uint256,address,uint256,uint256)"].topic
      ],
    ],
  });

type Item = BatchProcessorItem<typeof processor>;
type Context = BatchContext<Store, Item>;

processor.run(database, async (ctx) => {
  const transfersData: TransferData[] = [];
  const sellsData: SellData[] = [];
  const buysData: BuyData[] = [];
  const TicketMintsData: TicketMintData[] = [];
  const DevTicketMintsData: DevTicketMintData[] = [];
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

          if (transfersData.length !== 0) {
            // kalau ada transfer yang udah masuk, urus dulu transfer nya
            await saveTransfers(ctx, transfersData);
            while (transfersData.length !== 0) {
              transfersData.pop();
            }
          }
        }

        if (item.event.args.address === ticketPassAContract.address) {
          console.log(
            "==============THERE IS AN EVENT FROM TICKETPASS================"
          );
          const topics = item.event.args.topics;
          if (topics[0] === ticketPassA.events["Transfer(address,address,uint256)"].topic) {
            const transfer = handleTransfer(block.header, item.event);
            transfersData.push(transfer);
          }

          if (topics[0] === ticketPassA.events["MintEvent(uint256,address,uint256,uint256)"].topic) {
            const mint = handleTicketPassMint(block.header, item.event);
            TicketMintsData.push(mint)

            if (transfersData.length !== 0) {
              // kalau ada transfer yang udah masuk, urus dulu transfer nya
              await saveTransfers(ctx, transfersData);
              while (transfersData.length !== 0) {
                transfersData.pop();
              }
            }
          }

          if (topics[0] === ticketPassA.events["DevMintEvent(uint256,address,uint256)"].topic) {
            const devMint = handleTicketPassDevMint(block.header, item.event);
            DevTicketMintsData.push(devMint)

            if (transfersData.length !== 0) {
              // kalau ada transfer yang udah masuk, urus dulu transfer nya
              await saveTransfers(ctx, transfersData);
              while (transfersData.length !== 0) {
                transfersData.pop();
              }
            }
          }

          if (sellsData.length !== 0) {
            // kalau ada transfer, sell event nya di handle dulu
            await saveSell(ctx, sellsData);
            while (sellsData.length !== 0) {
              sellsData.pop();
            }
          }

          if (buysData.length !== 0) {
            // kalau ada transfer, buy event nya di itu muncul duluan jadi di handle duluan,
            // transferEvent nya itu lebih duluan daripada buyEvent. Jadi ada dua kemungkinan
            // transfer nya buy dihandle ketika event marketplace buy ketangkep. abis itu
            // buy event nya di handle ketika ada transfer yang berikutnya atau ketika udah
            // last round save
            await saveBuy(ctx, buysData);
            while (buysData.length !== 0) {
              buysData.pop();
            }
          }
        }
      }
    }
  }

  // last round save
  await saveTransfers(ctx, transfersData);
  await saveSell(ctx, sellsData);
  await saveBuy(ctx, buysData);
  await saveTicketPass(ctx, TicketMintsData);
  await saveDevTicketPass(ctx, DevTicketMintsData);
});

function handleTransfer(
  block: SubstrateBlock,
  event: EvmLogEvent
): TransferData {

  let from: string
  let to: string
  let tokenId: string

  if (event.args.address === fishContract.address) {
    const params = nftFish.events["Minted(address,address,uint256,string)"].decode(event.args)
    from = params.from
    to = params.to
    tokenId = params.tokenId.toString()
  } else {
    const params = erc721.events[
      "Transfer(address,address,uint256)"
    ].decode(event.args);

    from = params.from
    to = params.to
    tokenId = params.tokenId.toString()
  }

  const transfer: TransferData = {
    id: event.id,
    token: tokenId,
    from,
    to,
    timestamp: BigInt(block.timestamp),
    block: block.height,
    transactionHash: event.evmTxHash,
    contractAddress: event.args.address,
  };
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

function handleTicketPassMint(block: SubstrateBlock, event: EvmLogEvent): TicketMintData {
  const {startTokenID, quantity, to, value } = 
    ticketPassA.events["MintEvent(uint256,address,uint256,uint256)"].decode(event.args)

  const data: TicketMintData = {
    id: event.id,
    quantity: quantity.toNumber(),
    startTokenID: startTokenID.toNumber(),
    to,
    value: value.toBigInt()
  } 

  return data;
}

function handleTicketPassDevMint(block: SubstrateBlock, event: EvmLogEvent): DevTicketMintData {
  const {startTokenID, quantity, to } = 
    ticketPassA.events["DevMintEvent(uint256,address,uint256)"].decode(event.args)

  const data: DevTicketMintData = {
    id: event.id,
    quantity: quantity.toNumber(),
    startTokenID: startTokenID.toNumber(),
    to
  } 

  return data;
}

const collectionTokenId = (address: string, tokenId: string) => {
  return `${
    contractMapping.get(address)?.contractModel.symbol || ""
  }-${tokenId}`;
};

async function saveTransfers(ctx: Context, transfersData: TransferData[]) {
  console.log("===================BEGIN SAVETRANSFER================");
  console.log("Transfer Data Length : ", transfersData.length);
  const tokensIds: Set<string> = new Set();
  const ownersIds: Set<string> = new Set();

  for (const transferData of transfersData) {
    tokensIds.add(
      collectionTokenId(transferData.contractAddress, transferData.token)
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
      `${collectionTokenId(transferData.contractAddress, transferData.token)}`
    );

    console.log(
      `Token With the id of ${collectionTokenId(
        transferData.contractAddress,
        transferData.token
      )} does ${token ? "exist" : "not exist"}`
    );

    if (token == null) {
      let uri = null;
      let imageUri = null;
      try {
        uri = await getTokenURI(
          transferData.token,
          transferData.contractAddress
        );
        if (uri.includes("https://")) {
        } else {
          // if (uri.includes("ipfs://")) {
          //   const get = await axios.get<ITokenURI>(
          //     uri.replace("ipfs://", "https://nftstorage.link/ipfs/")
          //   );
          //   imageUri = get.data.image;
          // }
          const get = await axios.get<ITokenURI>(
            uri
          );
          if (get.data?.image_alt) {
            imageUri = get.data.image_alt
          }
          if (get.data.image) {
            imageUri = get.data.image
          }
        }
      } catch (error) {}
      token = new Token({
        id: `${collectionTokenId(
          transferData.contractAddress,
          transferData.token
        )}`,
        uri,
        contract: await getContractEntity(
          ctx.store,
          transferData.contractAddress
        ),
        imageUri,
        tokenId: parseInt(transferData.token)
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
      if (activityEntity == null) {
        activityEntity = handleActivity(ActivityType.MINT, transferData, token, from, to)
        if (activityEntity) {
          activities.add(activityEntity);
        }
      }
    }

    token.isListed = false;
    token.owner = to;

    // incase uri fetching fail
    if (!token.uri || !token.imageUri) {
      try {
        let uri = null;
        let imageUri = null;
        uri = await getTokenURI(
          transferData.token,
          transferData.contractAddress
        );
        if (uri.includes("https://")) {
        } else {
          token.uri = uri;
          // if (uri.includes("ipfs://")) {
          //   const get = await axios.get<ITokenURI>(
          //     uri.replace("ipfs://", "https://nftstorage.link/ipfs/")
          //   );
          //   imageUri = get.data.image;
          // }
          const get = await axios.get<ITokenURI>(
            uri
          );
          if (get.data?.image_alt) {
            imageUri = get.data.image_alt
          }
          if (get.data.image) {
            imageUri = get.data.image
          }
          token.imageUri = imageUri
        }
      } catch (error) {}
    }

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
          to,
          timestamp: transferData.timestamp,
          token,
          transactionHash: transferData.transactionHash,
        });
        activities.add(activityEntity);
      }
    }
  }

  // console.log([...tokens.values()]);

  await ctx.store.save([...owners.values()]);
  await ctx.store.save([...tokens.values()]);
  await ctx.store.save([...transfers]);
  await ctx.store.save([...activities]);

  console.log("===================END SAVETRANSFER================");
}

async function saveSell(ctx: Context, sellsData: SellData[]) {
  console.log("===================BEGIN SAVESELL================");
  const tokensIds: Set<string> = new Set();
  const ownersIds: Set<string> = new Set();

  for (const sellData of sellsData) {
    tokensIds.add(
      `${collectionTokenId(sellData.nftContractAddress, sellData.tokenId)}`
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
      `${collectionTokenId(sellData.nftContractAddress, sellData.tokenId)}`
    );

    if (token != null) {
      token.owner = from;
      token.isListed = true;
    }
    const to = undefined
    const sellActivity = handleActivity(ActivityType.LISTING, sellData, token, from, to)

    activities.add(sellActivity);
  }

  console.log("Sell Tokens", [...tokens.values()]);

  await ctx.store.save([...owners.values()]);
  await ctx.store.save([...tokens.values()]);
  await ctx.store.save([...activities]);

  console.log("===================END SAVESELLL================");
}

async function saveBuy(ctx: Context, buysData: BuyData[]) {
  console.log("===================BEGIN SAVEBUY================");
  const tokensIds: Set<string> = new Set();
  const ownersIds: Set<string> = new Set();

  for (const buyData of buysData) {
    tokensIds.add(
      `${collectionTokenId(buyData.nftContractAddress, buyData.tokenId)}`
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
      `${collectionTokenId(buyData.nftContractAddress, buyData.tokenId)}`
    );

    if (token != null) {
      token.owner = to;
      token.isListed = false;
    }

    const buyActivity = handleActivity(ActivityType.SOLD, buyData, token, from, to)

    activities.add(buyActivity);
  }

  console.log("Buy Tokens", [...tokens.values()]);

  await ctx.store.save([...owners.values()]);
  await ctx.store.save([...tokens.values()]);
  await ctx.store.save([...activities]);

  console.log("===================END SAVEBUY================");
}

async function saveTicketPass(ctx: Context, mintsData: TicketMintData[]) {
  for (const mintData of mintsData) {
    const { startTokenID, quantity } = mintData;
    let tokenIds: number[] = Array.from(new Array(quantity), (x, i) => i + startTokenID);
    for (const tokenId of tokenIds) {
      // Shoot here
      console.log(`tokenId : ${tokenId}`)
      // try {
      //   await axios.post("https://", { tokenId })
      // } catch (error) {}
    }
  }
}

async function saveDevTicketPass(ctx: Context, devMintsData: DevTicketMintData[]) {
  for (const mintData of devMintsData) {
    const { startTokenID, quantity } = mintData;
    let tokenIds: number[] = Array.from(new Array(quantity), (x, i) => i + startTokenID);
    for (const tokenId of tokenIds) {
      // Shoot here
      console.log(`tokenId : ${tokenId}`)
      // try {
      //   await axios.post("https://", { tokenId })
      // } catch (error) {}
    }
  }
}
