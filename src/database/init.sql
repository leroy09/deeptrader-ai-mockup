-- Tokens table
CREATE TABLE IF NOT EXISTS tokens (
    id SERIAL PRIMARY KEY,
    contract_address TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    creator_wallet TEXT NOT NULL,
    migration_time TIMESTAMP NOT NULL,
    initial_liquidity DECIMAL(20,8) NOT NULL,
    creator_fee DECIMAL(5,2) NOT NULL,
    holders INTEGER NOT NULL,
    social_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for tokens
CREATE INDEX IF NOT EXISTS idx_tokens_migration_time ON tokens(migration_time);
CREATE INDEX IF NOT EXISTS idx_tokens_creator_wallet ON tokens(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at);

-- Security checks table
CREATE TABLE IF NOT EXISTS security_checks (
    id SERIAL PRIMARY KEY,
    contract_address TEXT UNIQUE NOT NULL,
    rugcheck_score DECIMAL(5,2),
    rugcheck_verdict TEXT,
    top_holder_percent DECIMAL(5,2),
    is_bundled BOOLEAN DEFAULT FALSE,
    check_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contract_address) REFERENCES tokens(contract_address)
);

-- Indexes for security checks
CREATE INDEX IF NOT EXISTS idx_security_checks_check_time ON security_checks(check_time);
CREATE INDEX IF NOT EXISTS idx_security_checks_rugcheck_score ON security_checks(rugcheck_score);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    contract_address TEXT NOT NULL,
    tx_hash TEXT UNIQUE NOT NULL,
    direction TEXT CHECK (direction IN ('buy', 'sell')),
    amount_sol DECIMAL(20,8) NOT NULL,
    price_sol DECIMAL(20,8) NOT NULL,
    gas_price DECIMAL(20,8) NOT NULL,
    block_number INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contract_address) REFERENCES tokens(contract_address)
);

-- Indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_contract_address ON transactions(contract_address);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_direction ON transactions(direction);
CREATE INDEX IF NOT EXISTS idx_transactions_block_number ON transactions(block_number);

-- Social metrics table
CREATE TABLE IF NOT EXISTS social_metrics (
    id SERIAL PRIMARY KEY,
    contract_address TEXT NOT NULL,
    platform TEXT NOT NULL,
    handle TEXT,
    followers_count INTEGER,
    engagement_rate DECIMAL(5,2),
    sentiment_score DECIMAL(5,2),
    last_updated TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contract_address) REFERENCES tokens(contract_address)
);

-- Indexes for social metrics
CREATE INDEX IF NOT EXISTS idx_social_metrics_contract_platform ON social_metrics(contract_address, platform);
CREATE INDEX IF NOT EXISTS idx_social_metrics_last_updated ON social_metrics(last_updated);
CREATE INDEX IF NOT EXISTS idx_social_metrics_sentiment ON social_metrics(sentiment_score);

-- Trading alerts table
CREATE TABLE IF NOT EXISTS trading_alerts (
    id SERIAL PRIMARY KEY,
    contract_address TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
    was_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contract_address) REFERENCES tokens(contract_address)
);

-- Indexes for trading alerts
CREATE INDEX IF NOT EXISTS idx_trading_alerts_contract_address ON trading_alerts(contract_address);
CREATE INDEX IF NOT EXISTS idx_trading_alerts_type_severity ON trading_alerts(alert_type, severity);
CREATE INDEX IF NOT EXISTS idx_trading_alerts_was_sent ON trading_alerts(was_sent);
CREATE INDEX IF NOT EXISTS idx_trading_alerts_created_at ON trading_alerts(created_at);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tokens_liquidity_holders ON tokens(initial_liquidity, holders);
CREATE INDEX IF NOT EXISTS idx_security_score_verdict ON security_checks(rugcheck_score, rugcheck_verdict);

-- Security checks table needs liquidity_locked column
CREATE TABLE IF NOT EXISTS security_checks (
    id SERIAL PRIMARY KEY,
    contract_address TEXT UNIQUE NOT NULL,
    rugcheck_score DECIMAL(5,2),
    rugcheck_verdict TEXT,
    top_holder_percent DECIMAL(5,2),
    is_bundled BOOLEAN DEFAULT FALSE,
    liquidity_locked BOOLEAN DEFAULT FALSE,  -- Add this
    check_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contract_address) REFERENCES tokens(contract_address)
);