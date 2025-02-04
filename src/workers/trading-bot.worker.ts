import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Telegraf } from 'telegraf';
import { DatabaseService } from '../services/database.service'; // Not in this repo
import axios from 'axios';
import {
    RawCoinData,
    ParsedCoinData,
    SecurityCheckResult,
    TransactionPattern
} from '../types/trading-bot.types';
import {
    NewToken,
    NewSecurityCheck
} from '../types/types.db';

@Injectable()
export class TradingBotWorkerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TradingBotWorkerService.name);
    private readonly bot: Telegraf;
    private readonly connection: Connection;
    private isInitialized = false;
    private currentlyAnalyzedToken: string | null = null;

    constructor(private readonly dbService: DatabaseService) {
        // Initialize Solana connection (using mainnet-beta)
        this.connection = new Connection(
            process.env.SOLANA_RPC_ENDPOINT || clusterApiUrl('mainnet-beta'),
            'confirmed'
        );

        // Initialize Telegram bot
        this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

        // Setup handlers
        this.setupTelegramHandlers();
    }

    async onModuleInit() {
        try {
            await this.bot.launch();
            this.isInitialized = true;
            this.logger.log('========== TRADING BOT INITIALIZED ==========');
            this.monitoringLoop();  // Start the monitoring loop
        } catch (error) {
            this.logger.error('Failed to initialize Trading bot:', error);
        }
    }

    private async setupTelegramHandlers() {
        this.bot.command('start', async (ctx) => {
            await ctx.reply(
                '🤖 Welcome to DeepTrader AI - Solana Trading Bot!\n\n' +
                'We analyze new tokens on Solana for:\n' +
                '• Liquidity Analysis\n' +
                '• Holder Distribution\n' +
                '• Rugcheck Integration\n' +
                '• Price Movement Patterns\n\n' +
                'Available commands:\n' +
                '/stats - View current stats\n' +
                '/info [token] - Get token info'
            );
        });

        this.bot.command('stats', async (ctx) => {
            try {
                const stats = await this.getSystemStats();
                await ctx.reply(
                    '📊 Current Stats:\n\n' +
                    `Tokens Analyzed: ${stats.tokensAnalyzed}\n` +
                    `Success Rate: ${stats.successRate}%\n` +
                    `Active Monitors: ${stats.activeMonitors}\n` +
                    `Avg Daily Volume: ${stats.avgDailyVolume} SOL`
                );
            } catch (error) {
                this.logger.error('Error sending stats:', error);
                await ctx.reply('Error fetching stats');
            }
        });
    }

    private async fetchNewTokens(): Promise<RawCoinData[]> {
        try {
            // Fetches newly listed/migrated tokens from PumpFun API
            // This API provides real-time data about new token launches on Solana
            // Returns: Array of token data including contract address, initial liquidity, 
            // creator info, and basic token metrics
            const response = await axios.get(
                `${process.env.PUMPFUN_API_URL}/migrations`,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.PUMPFUN_API_KEY}`
                    }
                }
            );
            return response.data.data;
        } catch (error) {
            this.logger.error('Error fetching new tokens:', error);
            return [];
        }
    }

    private async analyzeToken(tokenAddress: string): Promise<SecurityCheckResult> {
        try {
            // Get basic token account information from Solana RPC
            // Returns: Token metadata, supply info, and other account details
            const tokenInfo = await this.connection.getParsedAccountInfo(
                new PublicKey(tokenAddress)
            );

            // Fetch largest token holder accounts from Solana RPC
            // Used to analyze wallet distribution and identify potential risks
            // Returns: Array of largest token holders with their balances
            const holders = await this.connection.getTokenLargestAccounts(
                new PublicKey(tokenAddress)
            );

            // Verify if the token's liquidity is locked through timelock contracts
            const liquidityLocked = await this.checkLiquidityLock(tokenAddress);

            // Query rugcheck API for token safety score
            // Returns: Security score (0-100) based on contract analysis and other metrics
            const rugcheckScore = await this.getRugcheckScore(tokenAddress);

            return {
                contractAddress: tokenAddress,
                rugcheckScore: rugcheckScore,
                rugcheckVerdict: rugcheckScore > 70 ? 'Safe' : 'Risky',
                topHolderPercent: this.calculateTopHolderPercent(holders),
                isBundled: holders.value.length < 10,
                liquidityLocked,
                checkTime: new Date()
            };
        } catch (error) {
            this.logger.error(`Error analyzing token ${tokenAddress}:`, error);
            throw error;
        }
    }

    private async monitoringLoop() {
        while (this.isInitialized) {
            try {
                const newTokens = await this.fetchNewTokens();

                for (const token of newTokens) {
                    // Basic validation
                    if (!this.validateTokenBasics(token)) {
                        continue;
                    }

                    // Security checks
                    const securityResult = await this.analyzeToken(token.contractAddress);
                    if (!this.isSecurityCheckPassed(securityResult)) {
                        continue;
                    }

                    // Store results
                    await this.storeAnalysis(token, securityResult);

                    // Send alert if promising
                    if (this.shouldAlertToken(securityResult)) {
                        await this.sendTokenAlert(token, securityResult);
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute delay
            } catch (error) {
                this.logger.error('Error in monitoring loop:', error);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    private async getSystemStats() {
        try {
            const stats = await this.dbService.db
                .selectFrom('tokens')
                .select([
                    ({ fn }) => fn.count('id').as('tokensAnalyzed'),
                    ({ fn }) => fn.avg('success_rate').as('successRate'),
                    ({ fn }) => fn.count('id').where('is_active', '=', true).as('activeMonitors'),
                    ({ fn }) => fn.avg('daily_volume').as('avgDailyVolume')
                ])
                .executeTakeFirst();

            return {
                tokensAnalyzed: Number(stats?.tokensAnalyzed || 0),
                successRate: Number(stats?.successRate || 0).toFixed(1),
                activeMonitors: Number(stats?.activeMonitors || 0),
                avgDailyVolume: Number(stats?.avgDailyVolume || 0).toFixed(2)
            };
        } catch (error) {
            this.logger.error('Error getting system stats:', error);
            return {
                tokensAnalyzed: 0,
                successRate: '0.0',
                activeMonitors: 0,
                avgDailyVolume: '0.00'
            };
        }
    }

    private async checkLiquidityLock(tokenAddress: string): Promise<boolean> {
        try {
            // Query Solana RPC for all program accounts associated with the token
            // Specifically looking for LP (Liquidity Provider) token accounts
            // Uses filters to only get relevant token accounts:
            // - dataSize: 165 bytes (standard token account size)
            // - memcmp: Matches accounts owned by TOKEN_PROGRAM_ID
            const lpTokens = await this.connection.getProgramAccounts(
                new PublicKey(tokenAddress),
                {
                    filters: [
                        { dataSize: 165 }, // Size of token account data
                        { memcmp: { offset: 0, bytes: TOKEN_PROGRAM_ID.toBase58() } }
                    ]
                }
            );

            // For each LP token, check if it's locked in a timelock program
            // Iterates through found LP tokens and verifies if they're in known
            // timelock contract addresses (Unicrypt, etc.)
            for (const lpToken of lpTokens) {
                const timelock = await this.connection.getAccountInfo(lpToken.pubkey);
                if (timelock && this.isTimelockProgram(timelock.owner)) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            this.logger.error(`Error checking liquidity lock for ${tokenAddress}:`, error);
            return false;
        }
    }

    private async getRugcheckScore(tokenAddress: string): Promise<number> {
        try {
            // Query Rugcheck API to get security score for the token
            // Returns: Security score from 0-100, where higher is safer
            const response = await axios.get(
                `${process.env.RUGCHECK_API_URL}/token/${tokenAddress}`,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.RUGCHECK_API_KEY}`
                    }
                }
            );
            return response.data.score || 0;
        } catch (error) {
            this.logger.error(`Error getting rugcheck score for ${tokenAddress}:`, error);
            return 0;
        }
    }

    private calculateTopHolderPercent(holders: any): number {
        try {
            const totalSupply = holders.value.reduce((acc: number, h: any) => acc + h.amount, 0);
            const topHolder = holders.value[0]?.amount || 0;
            return (topHolder / totalSupply) * 100;
        } catch (error) {
            this.logger.error('Error calculating top holder percent:', error);
            return 100; // Return 100% as a conservative estimate
        }
    }

    private validateTokenBasics(token: RawCoinData): boolean {
        if (!token.contractAddress || !token.token.symbol) {
            return false;
        }

        // Check minimum requirements
        const minLiquidity = parseFloat(process.env.MIN_LIQUIDITY || '5');
        const maxFee = parseFloat(process.env.MAX_CREATOR_FEE || '10');
        const minHolders = parseInt(process.env.MIN_HOLDERS || '25');

        return (
            token.initialLiquidity >= minLiquidity &&
            token.feePercentage <= maxFee &&
            token.holderCount >= minHolders
        );
    }

    private isSecurityCheckPassed(security: SecurityCheckResult): boolean {
        const minRugcheckScore = parseInt(process.env.MIN_RUGCHECK_SCORE || '70');
        const maxTopHolderPercent = parseInt(process.env.MAX_TOP_HOLDER_PERCENT || '20');

        return (
            security.rugcheckScore >= minRugcheckScore &&
            security.topHolderPercent <= maxTopHolderPercent &&
            !security.isBundled &&
            security.liquidityLocked
        );
    }

    private async storeAnalysis(token: RawCoinData, security: SecurityCheckResult) {
        try {
            await this.dbService.db.transaction().execute(async (trx) => {
                // Store token info
                await trx
                    .insertInto('tokens')
                    .values({
                        contract_address: token.contractAddress,
                        name: token.token.name,
                        symbol: token.token.symbol,
                        creator_wallet: token.creator,
                        migration_time: new Date(token.migrationTime),
                        initial_liquidity: token.initialLiquidity,
                        creator_fee: token.feePercentage,
                        holders: token.holderCount,
                        created_at: new Date()
                    } as NewToken)
                    .onConflict((oc) => oc.doNothing())
                    .execute();

                // Store security check
                await trx
                    .insertInto('security_checks')
                    .values({
                        contract_address: security.contractAddress,
                        rugcheck_score: security.rugcheckScore,
                        rugcheck_verdict: security.rugcheckVerdict,
                        top_holder_percent: security.topHolderPercent,
                        is_bundled: security.isBundled,
                        liquidity_locked: security.liquidityLocked,
                        check_time: security.checkTime
                    } as NewSecurityCheck)
                    .onConflict((oc) => oc.doNothing())
                    .execute();
            });
        } catch (error) {
            this.logger.error('Error storing analysis:', error);
            throw error;
        }
    }

    private shouldAlertToken(security: SecurityCheckResult): boolean {
        return (
            security.rugcheckScore >= 80 &&
            security.topHolderPercent <= 15 &&
            security.liquidityLocked &&
            !security.isBundled
        );
    }

    private async sendTokenAlert(token: RawCoinData, security: SecurityCheckResult) {
        try {
            const message =
                '🚨 New Token Alert!\n\n' +
                `Name: ${token.token.name} (${token.token.symbol})\n` +
                `Address: ${token.contractAddress}\n\n` +
                `💧 Liquidity: ${token.initialLiquidity} SOL\n` +
                `👥 Holders: ${token.holderCount}\n` +
                `🔒 Liquidity Locked: ${security.liquidityLocked ? 'Yes' : 'No'}\n` +
                `🛡️ Rugcheck Score: ${security.rugcheckScore}/100\n\n` +
                `🔍 Top Holder: ${security.topHolderPercent.toFixed(2)}%\n` +
                `\nAnalysis: ${security.rugcheckVerdict}`;

            await this.bot.telegram.sendMessage(
                process.env.TELEGRAM_CHANNEL_ID || '',
                message,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            this.logger.error('Error sending token alert:', error);
        }
    }

    private isTimelockProgram(programId: PublicKey): boolean {
        // List of known timelock program IDs on Solana
        const timelockPrograms = [
            'Lock7DCXKqJakibJKf8GJwm3CYmknWbUVKbQYq9xUGaGg',  // Unicrypt
            'TPLock3XXXXXXXXXXXXXXXXXXXXXXXXXXXXXy1ZtX',      // Token timelock
        ];
        return timelockPrograms.includes(programId.toString());
    }
}