export type OracleOptions = {
  /** Override key for testing; production reads process.env.COINGECKO_API_KEY. */
  apiKey?: string;
  /** HTTP timeout in ms. Default 5000. */
  timeoutMs?: number;
};

export type AlternativeItem = {
  value: string;
  value_classification: string;
  timestamp: string;
  time_until_update: string;
};

export type FeedGreedItem = {
  value: number;
  value_classification: string;
  timestamp: Date;
};
