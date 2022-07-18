import * as ethers from "ethers";

export const abi = new ethers.utils.Interface(getJsonAbi());

export interface BuyEvent0Event {
  buyer: string;
  seller: string;
  tokenId: ethers.BigNumber;
  price: ethers.BigNumber;
  buyTime: ethers.BigNumber;
  NFTAddress: string;
}

export interface OwnershipTransferred0Event {
  previousOwner: string;
  newOwner: string;
}

export interface SellEvent0Event {
  seller: string;
  tokenId: ethers.BigNumber;
  price: ethers.BigNumber;
  NFTAddress: string;
}

export interface EvmEvent {
  data: string;
  topics: string[];
}

export const events = {
  "BuyEvent(address,address,uint256,uint256,uint256,address)":  {
    topic: abi.getEventTopic("BuyEvent(address,address,uint256,uint256,uint256,address)"),
    decode(data: EvmEvent): BuyEvent0Event {
      const result = abi.decodeEventLog(
        abi.getEvent("BuyEvent(address,address,uint256,uint256,uint256,address)"),
        data.data || "",
        data.topics
      );
      return  {
        buyer: result[0],
        seller: result[1],
        tokenId: result[2],
        price: result[3],
        buyTime: result[4],
        NFTAddress: result[5],
      }
    }
  }
  ,
  "OwnershipTransferred(address,address)":  {
    topic: abi.getEventTopic("OwnershipTransferred(address,address)"),
    decode(data: EvmEvent): OwnershipTransferred0Event {
      const result = abi.decodeEventLog(
        abi.getEvent("OwnershipTransferred(address,address)"),
        data.data || "",
        data.topics
      );
      return  {
        previousOwner: result[0],
        newOwner: result[1],
      }
    }
  }
  ,
  "SellEvent(address,uint256,uint256,address)":  {
    topic: abi.getEventTopic("SellEvent(address,uint256,uint256,address)"),
    decode(data: EvmEvent): SellEvent0Event {
      const result = abi.decodeEventLog(
        abi.getEvent("SellEvent(address,uint256,uint256,address)"),
        data.data || "",
        data.topics
      );
      return  {
        seller: result[0],
        tokenId: result[1],
        price: result[2],
        NFTAddress: result[3],
      }
    }
  }
  ,
}

function getJsonAbi(): any {
  return [
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_NFTAddress",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_platformAddress",
          "type": "address"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "address",
          "name": "buyer",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "address",
          "name": "seller",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "tokenId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "price",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "buyTime",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "address",
          "name": "NFTAddress",
          "type": "address"
        }
      ],
      "name": "BuyEvent",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "previousOwner",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "OwnershipTransferred",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "address",
          "name": "seller",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "tokenId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "price",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "address",
          "name": "NFTAddress",
          "type": "address"
        }
      ],
      "name": "SellEvent",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "NFTAddress",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "string[]",
          "name": "_tokenURI",
          "type": "string[]"
        },
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "batchMint",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "tokenId",
          "type": "uint256"
        }
      ],
      "name": "buy",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "fishInfo",
      "outputs": [
        {
          "internalType": "address",
          "name": "seller",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "tokenId",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "price",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "owner",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "platformAddress",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "renounceOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_tokenId",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_price",
          "type": "uint256"
        },
        {
          "internalType": "string",
          "name": "_tokenURI",
          "type": "string"
        }
      ],
      "name": "sell",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "transferOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ]
}
