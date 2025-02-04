// Table Interfaces
export interface DBToken {
    id: number;
    contract_address: string;
    name: string;
    symbol: string;
    creator_wallet: string;
    migration_time: Date;
    initial_liquidity: number;
    creator_fee: number;
    holders: number;
    social_score?: number;
    created_at: Date;
}

export interface DBSecurityCheck {
    id: number;
    contract_address: string;
    rugcheck_score?: number;
    rugcheck_verdict?: string;
    top_holder_percent?: number;
    is_bundled: boolean;
    liquidity_locked: boolean;
    check_time: Date;
    created_at: Date;
}

export interface DBTransaction {
    id: number;
    contract_address: string;
    tx_hash: string;
    direction: 'buy' | 'sell';
    amount_sol: number;
    price_sol: number;
    gas_price: number;
    block_number: number;
    timestamp: Date;
    created_at: Date;
}

export interface DBSocialMetrics {
    id: number;
    contract_address: string;
    platform: string;
    handle?: string;
    followers_count?: number;
    engagement_rate?: number;
    sentiment_score?: number;
    last_updated: Date;
    created_at: Date;
}

export interface DBTradingAlert {
    id: number;
    contract_address: string;
    alert_type: string;
    message: string;
    severity: 'low' | 'medium' | 'high';
    was_sent: boolean;
    created_at: Date;
}

// Insert Types (without id and created_at)
export type NewToken = Omit<DBToken, 'id' | 'created_at'>;
export type NewSecurityCheck = Omit<DBSecurityCheck, 'id' | 'created_at'>;
export type NewTransaction = Omit<DBTransaction, 'id' | 'created_at'>;
export type NewSocialMetrics = Omit<DBSocialMetrics, 'id' | 'created_at'>;
export type NewTradingAlert = Omit<DBTradingAlert, 'id' | 'created_at'>;

// Join Types for Common Queries
export interface TokenWithSecurity extends DBToken {
    security_check?: DBSecurityCheck;
}

export interface TokenWithMetrics extends DBToken {
    social_metrics?: DBSocialMetrics[];
    security_check?: DBSecurityCheck;
    transactions?: DBTransaction[];
}

export interface TokenFullDetails extends TokenWithMetrics {
    trading_alerts?: DBTradingAlert[];
}