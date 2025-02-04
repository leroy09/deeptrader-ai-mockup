export interface RawCoinData {
    contractAddress: string;
    token: {
        name: string;
        symbol: string;
        decimals: number;
    };
    creator: string;
    migrationTime: string;
    initialLiquidity: number;
    feePercentage: number;
    holderCount: number;
}

export interface ParsedCoinData {
    contractAddress: string;
    name: string;
    symbol: string;
    creatorWallet: string;
    migrationTime: Date;
    initialLiquidity: number;
    creatorFee: number;
    holders: number;
    mintAuthority?: string;
    freezeAuthority?: string;
    supply?: number;
}

export interface SecurityCheckResult {
    contractAddress: string;
    rugcheckScore: number;
    rugcheckVerdict: string;
    topHolderPercent: number;
    isBundled: boolean;
    liquidityLocked: boolean;
    checkTime: Date;
}

export interface TransactionPattern {
    tokenAddress: string;
    txCount: number;
    totalVolume: number;
    avgPrice: number;
    holderDistribution: number;
    isRisky: boolean;
}