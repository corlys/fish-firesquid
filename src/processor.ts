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
import { In, IsNull, Not } from "typeorm";
import axios from "axios";
import {
  CHAIN_NODE,
  getContractEntity,
  contractMapping,
} from "./contract";
import { TransferData, ITokenURI, TicketMintData, ITokenPayload, IOffchainPayload, INewUriData, IMetaData } from "./types"
import { handleActivity  } from "./operator"
import { fishContract } from "./helper/Fish";
import { ticketPassAContract } from "./helper/TicketPassA";
import { Owner, Token, Transfer, Activity, ActivityType } from "./model";
import * as erc721 from "./abi/erc721";
import * as nftFish from "./abi/nftFish";
import * as ticketPassA from "./abi/ticketPassA"
import { ethers } from "ethers";

const database = new TypeormDatabase();
const processor = new SubstrateBatchProcessor()
  .setBatchSize(500)
  .setBlockRange({ from: 1716880 })
  .setDataSource({
    chain: CHAIN_NODE,
    archive: lookupArchive("astar", { release: "FireSquid" }),
  })
  .setTypesBundle("astar")
  .addEvmLog(ticketPassAContract.address, {
    range: { from: 1716880 },
    filter: [
      [
        ticketPassA.events["Transfer(address,address,uint256)"].topic,
        ticketPassA.events["MintEvent(uint256,address,uint256,uint256)"].topic,
        ticketPassA.events["SetNewURI(string)"].topic
      ],
    ],
  });

type Item = BatchProcessorItem<typeof processor>;
type Context = BatchContext<Store, Item>;

processor.run(database, async (ctx) => {
  const transfersData: TransferData[] = [];
  const TicketMintsData: TicketMintData[] = [];
  const SetNewUriData: INewUriData[] = []
  // new eventData
  for (const block of ctx.blocks) {
    for (const item of block.items) {
      if (item.name === "EVM.Log") {
        const topics: string[] = item.event.args.topics;
        
        if (topics[0] === erc721.events["Transfer(address,address,uint256)"].topic) {
          ctx.log.info(`${item.event.args.address} ${block.header.height}`)
          const transfer = handleTransfer(block.header, item.event);
          if (transfer) transfersData.push(transfer);
        }

        if (topics[0] === ticketPassA.events["MintEvent(uint256,address,uint256,uint256)"].topic) {
          ctx.log.info(`${item.event.args.address} ${block.header.height}`)
          const mint = handleTicketPassMint(block.header, item.event);
          TicketMintsData.push(mint)
        }

        if(topics[0] === ticketPassA.events["SetNewURI(string)"].topic) {
          const newUri = handleNewUri(block.header, item.event);
          SetNewUriData.push(newUri);
        }
      }
    }
  }

  // last round save
  await saveTransfers(ctx, transfersData);
  await saveTicketPass(ctx, TicketMintsData);
  await saveNewUri(ctx, SetNewUriData)
  await handleNullImage(ctx);
  ctx.log.info(`Round Done`)
});

function handleNewUri (
  block: SubstrateBlock,
  event: EvmLogEvent
): INewUriData {
  const { newURI } = ticketPassA.events[
    "SetNewURI(string)"
  ].decode(event.args);

  return {
    newUri: newURI,
    block: block.height
  };
}

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

function handleTicketPassMint(block: SubstrateBlock, event: EvmLogEvent): TicketMintData {
  const {startTokenID, quantity, to, value } = 
    ticketPassA.events["MintEvent(uint256,address,uint256,uint256)"].decode(event.args)

  const data: TicketMintData = {
    id: event.id,
    quantity: quantity.toNumber(),
    startTokenID: startTokenID.toNumber(),
    to,
    value: value.toBigInt(),
    contractAddress: event.args.address
  } 

  return data;
}

const collectionTokenId = (address: string, tokenId: string) => {
  return `${
    contractMapping.get(address)?.contractModel.symbol || ""
  }-${tokenId}`;
};

async function handleURI (ctx: Context, height: number, contractAddress: string, tokenId: string): Promise<string> {
  try {
    // hardcode the block height to recent block until know how to get the highest block
    const hardCodedBlockHeight = 1789333;
    const tokenContract = new erc721.Contract(ctx, { height: hardCodedBlockHeight > height ? hardCodedBlockHeight : height }, contractAddress)
    return await tokenContract.tokenURI(ethers.BigNumber.from(tokenId)) 
  } catch (error: any) {
    ctx.log.error(`Error handling URI : ${error}`)
    return ""
  }
}

async function handleImage(tokenURI: string, ctx: Context) {
  try {
    // check if the URI is centralized of decentralizer
    // if its decentralized
    return null //for now since thelinks are not ready yet
    if (tokenURI.length === 0) return null
    if (tokenURI.includes("ipfs://")) {
      try {
        const { data } = await axios.get<ITokenURI>(tokenURI.replace("ipfs://", "https://nftstorage.link/ipfs/"))

        if (data?.image) return data.image
        if (data?.image_alt) return data.image_alt
        ctx.log.error(`Data does not exist: ${data} ${tokenURI.replace("ipfs://", "https://nftstorage.link/ipfs/")}`)
        return null
      } catch (error) {
        ctx.log.error(`Fetching Image Error: ${tokenURI.replace("ipfs://", "https://nftstorage.link/ipfs/")} - ${error}`)
        return null
      }

    } else {
      try {
        const { data } = await axios.get<ITokenURI>(tokenURI.replace("https://", "http://"))
  
        if (data?.image) return data.image
        if (data?.image_alt) return data.image_alt
        ctx.log.error(`Data does not exist: ${data} ${tokenURI}`)
        return null  
      } catch (error) {
        ctx.log.error(`Fetching Image Error: ${tokenURI} - ${error}`)
        return null
      }
    }
  } catch (error: any) {
    ctx.log.error(`error handleImage: ${error}`)
    return null
  }
}

async function handleNullImage (ctx: Context) {
  let tokens: Map<string, Token> = new Map(
    (await ctx.store.find(Token, { where: { imageUri : IsNull() } })).map((token) => [
      token.id,
      token,
    ])
  );

  for (const token of tokens) {
    const _token = token[1]
    if (_token.uri) {
      _token.imageUri = await handleImage(_token.uri, ctx)
      tokens.set(_token.id, _token)
    }
  }

  await ctx.store.save([...tokens.values()])
}

async function saveTransfers(ctx: Context, transfersData: TransferData[]) {
  // ctx.log.info("===================BEGIN SAVETRANSFER================");
  // ctx.log.info(`Transfer Data Length : ${transfersData.length}`);
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
    // Create contract instance

    const blockHeight = { height: transferData.block }

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
      collectionTokenId(transferData.contractAddress, transferData.token)
    );

    // ctx.log.info(
    //   `Token With the id of ${collectionTokenId(
    //     transferData.contractAddress,
    //     transferData.token
    //   )} does ${token ? "exist" : "not exist"}`
    // );

    if (token == null) {
      let uri = await handleURI(ctx, blockHeight.height, transferData.contractAddress, transferData.token);
      let imageUri = await handleImage(uri, ctx);
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
        tokenId: parseInt(transferData.token),
        //waiting for fix from squid-devs
        owner: to,
        isListed: false
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
    } else {
      //waiting for fix from squid-devs
      token.isListed = false;
      token.owner = to;
      token.contract = await getContractEntity(
        ctx.store,
        transferData.contractAddress
      )
      tokens.set(token.id, token);
    }

    ctx.log.info(`${token.id} - ${token.uri} - ${token.imageUri}`)

    // incase uri fetching fail
    if (!token.uri || !token.imageUri) {
      token.uri = await handleURI(ctx, blockHeight.height, transferData.contractAddress, transferData.token)
      token.imageUri = await handleImage(token.uri, ctx)
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

  await ctx.store.save([...owners.values()]);
  await ctx.store.save([...tokens.values()]);
  await ctx.store.save([...transfers]);
  await ctx.store.save([...activities]);

  // ctx.log.info("===================END SAVETRANSFER================");
}

async function saveTicketPass(ctx: Context, mintsData: TicketMintData[]) {
  for (const mintData of mintsData) {
    const { startTokenID, quantity, contractAddress, to } = mintData;
    let tokenIds: number[] = Array.from(new Array(quantity), (x, i) => i + startTokenID);
    let tokenCollectionIds = tokenIds.map((id) => (
      collectionTokenId(contractAddress, id.toString())
    ))
    let tokenPayloads: ITokenPayload[] = []
    const tokens: Map<string, Token> = new Map(
      (await ctx.store.findBy(Token, { id: In([...tokenCollectionIds]) })).map((token) => [
        token.id,
        token,
      ])
    );
    for (const tokenId of tokenIds) {

      const token = tokens.get(collectionTokenId(contractAddress, tokenId.toString()))

      if (token != null) {

        try {
          ctx.log.info(`Hitting offhcain api with token_id ${token.tokenId}`)
          const hitAPI = await axios.post<IMetaData>("https://us-central1-cosmo-customize.cloudfunctions.net/app/api/generateBraceletMetadata", { token_id: token.tokenId }) 
          const { id, image, file } = hitAPI.data
          ctx.log.info(`${id} ${image} ${file}`)
          token.imageUri = image
          token.uri = file
          token.ticketId = id
          tokens.set(token.id, token)
        } catch (error: any) {
          ctx.log.error(error)
        }

        // tokenPayloads.push({
        //   token_id: token.tokenId,
        //   wallet_id: to
        // })

      }
    }
    // try {
    //   const result = await axios.post<IOffchainPayload>("https://us-central1-cosmo-customize.cloudfunctions.net/app/api/generateBraceletMetadata", { tokens: tokenPayloads })    
    //   if (result.data?.tokens && result.data?.tokens.length >= 0) {
    //     for (const offchainToken of result.data.tokens) {
    //       const token = tokens.get(collectionTokenId(contractAddress, offchainToken.id.toString()))

    //       if (token != null) {
    //         token.ticketId = offchainToken.id
    //         tokens.set(token.id, token)
    //       }
    //     }
    //   } 
    // } catch (error: any) {
    //   ctx.log.error(error?.message)
    // }

    await ctx.store.save([...tokens.values()])
  }
}

async function saveNewUri (ctx: Context, newUriData: INewUriData[]) {

  let tokens: Map<string, Token> = new Map(
    (await ctx.store.find(Token, { where: { id: Not(IsNull()) } })).map((token) => [
      token.id,
      token,
    ])
  );

  for (const data of newUriData) {
    for (const token of tokens) {
      const _token = token[1]
      _token.uri = `${data.newUri}${_token.tokenId}.json`;
      _token.imageUri = await handleImage(_token.uri, ctx);
      tokens.set(_token.id, _token);
    }
  }

  await ctx.store.save([...tokens.values()])
}
