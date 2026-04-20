export const AggregatorV3_ABI = [
    { inputs: [], name: "decimals", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "description", outputs: [{ internalType: "string", name: "", type: "string" }], stateMutability: "view", type: "function" },
    {
      inputs: [],
      name: "getRoundData",
      outputs: [
        { internalType: "uint80", name: "roundId", type: "uint80" },
        { internalType: "int256", name: "answer", type: "int256" },
        { internalType: "uint256", name: "startedAt", type: "uint256" },
        { internalType: "uint256", name: "updatedAt", type: "uint256" },
        { internalType: "uint80", name: "answeredInRound", type: "uint80" }
      ],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [],
      name: "latestRoundData",
      outputs: [
        { internalType: "uint80", name: "roundId", type: "uint80" },
        { internalType: "int256", name: "answer", type: "int256" },
        { internalType: "uint256", name: "startedAt", type: "uint256" },
        { internalType: "uint256", name: "updatedAt", type: "uint256" },
        { internalType: "uint80", name: "answeredInRound", type: "uint80" }
      ],
      stateMutability: "view",
      type: "function"
    },
    { inputs: [], name: "version", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" }
  ] as const;

export type GetRoundData = {
    0: string; 1: string; 2: string; 3: string; 4: string;
    roundId: string;
    answer: string;
    startedAt: string;
    updatedAt: string;
    answeredInRound: string;
};

export type LatestRoundData = {
    0: string; 1: string; 2: string; 3: string; 4: string;
    roundId: string;
    answer: string;
    startedAt: string;
    updatedAt: string;
    answeredInRound: string;
};

export type OracleOptions = {
  rpcUrl?: string;
  hermesUrl?: string;
  moneyMap?: Record<string, string>;
  cryptoMap?: Record<string, string>;
  timeoutMs?: number;
  binaryPriceFeed?: boolean;
};

export type AlternativeItem = {
  value: string;
  value_classification: string;
  timestamp: string;
  time_until_update: string;
}

export type FeedGreedItem = {
  value: number;
  value_classification: string;
  timestamp: Date;
}
