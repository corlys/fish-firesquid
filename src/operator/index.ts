import { Activity, ActivityType, Token, Owner } from "../model";
import { TransferData, SellData, BuyData } from "../types";

export const handleActivity = (
  type: ActivityType,
  data: TransferData | BuyData | SellData,
  token: Token | undefined,
  from: Owner | undefined,
  to: Owner | undefined
) => {
  if ("nftContractAddress" in data) {
    // sell or buy
    if ("buyTime" in data) {
      // buy
      const {
        nftContractAddress,
        transactionHash,
        block,
        price,
        timestamp,
        tokenId,
      } = data;
      return new Activity({
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
    } else {
      // sell
      const {
        block,
        price,
        timestamp,
        transactionHash,
        tokenId,
        nftContractAddress,
      } = data;
      return new Activity({
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
    }
  } else {
    // transfer
    return new Activity({
      id:
        data.contractAddress +
        "-" +
        data.transactionHash +
        "-" +
        data.token +
        "-" +
        ActivityType.MINT,
      type: ActivityType.MINT,
      block: data.block,
      from,
      to,
      timestamp: data.timestamp,
      token,
      transactionHash: data.transactionHash,
    });
  }
};
