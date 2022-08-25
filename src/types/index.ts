export type TransferData = {
  id: string;
  from: string;
  to: string;
  token: string;
  timestamp: bigint;
  block: number;
  transactionHash: string;
  contractAddress: string;
};

export type SellData = {
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

export type BuyData = {
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

export type TicketMintData = {
  id: string;
  to: string;
  startTokenID: number;
  quantity: number;
  value: bigint;
  contractAddress: string
}

export type DevTicketMintData = {
  id: string;
  startTokenID: number;
  to: string;
  quantity: number;
  contractAddress: string
}

export interface ITokenURI {
  image: string;
  image_alt: string;
  description: string;
  name: string;
}

export interface IMetaData {
  id: string;
  image: string;
  metadata: string;
  file: string
}