import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  parseUnits,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainConfig, tradingConfig } from "@/lib/config";
import type { Balance, Ticker, OrderRequest, OrderResult } from "@/types/exchange";
import type { OHLCV, Timeframe, Symbol } from "@/types/candle";

// --- World Chain definition ---
const worldChain: Chain = {
  id: 480,
  name: "World Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [chainConfig.rpcUrl] },
  },
};

// --- ABIs ---
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const quoterAbi = [
  {
    inputs: [
      {
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const swapRouterAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);

// --- Token decimals cache ---
const decimalsCache: Record<string, number> = {};

// --- Clients (lazy-init singletons) ---
let publicClient: PublicClient | null = null;
let walletClient: WalletClient | null = null;

function getPublicClient(): PublicClient {
  if (publicClient) return publicClient;
  publicClient = createPublicClient({
    chain: worldChain,
    transport: http(chainConfig.rpcUrl),
  });
  return publicClient;
}

function getWalletClient(): WalletClient {
  if (walletClient) return walletClient;
  const account = privateKeyToAccount(chainConfig.walletPrivateKey as `0x${string}`);
  walletClient = createWalletClient({
    account,
    chain: worldChain,
    transport: http(chainConfig.rpcUrl),
  });
  return walletClient;
}

function getWalletAddress(): `0x${string}` {
  const wc = getWalletClient();
  return wc.account!.address;
}

async function getDecimals(tokenAddress: `0x${string}`): Promise<number> {
  if (decimalsCache[tokenAddress]) return decimalsCache[tokenAddress];
  const client = getPublicClient();
  const decimals = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "decimals",
  });
  decimalsCache[tokenAddress] = decimals;
  return decimals;
}

// --- Symbol → token addresses mapping ---
function symbolToTokens(symbol: Symbol): { base: `0x${string}`; quote: `0x${string}` } {
  const [baseName, quoteName] = symbol.split("/");
  const tokens = chainConfig.tokens as Record<string, `0x${string}`>;
  const base = tokens[baseName];
  const quote = tokens[quoteName];
  if (!base || !quote) throw new Error(`Unknown symbol: ${symbol}`);
  return { base, quote };
}

// --- GeckoTerminal pool mapping ---
function symbolToPool(symbol: Symbol): string {
  if (symbol === "WLD/USDC") return chainConfig.wldUsdcPool;
  throw new Error(`No pool configured for ${symbol}`);
}

// =====================================================
// Public API — same 4 function signatures as before
// =====================================================

export async function fetchBalance(): Promise<Balance[]> {
  const client = getPublicClient();
  const wallet = getWalletAddress();

  const [wldBal, usdcBal, ethBal, wldDec, usdcDec] = await Promise.all([
    client.readContract({ address: chainConfig.tokens.WLD, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
    client.readContract({ address: chainConfig.tokens.USDC, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
    client.getBalance({ address: wallet }),
    getDecimals(chainConfig.tokens.WLD),
    getDecimals(chainConfig.tokens.USDC),
  ]);

  const balances: Balance[] = [
    { currency: "WLD", free: Number(formatUnits(wldBal, wldDec)), used: 0, total: Number(formatUnits(wldBal, wldDec)) },
    { currency: "USDC", free: Number(formatUnits(usdcBal, usdcDec)), used: 0, total: Number(formatUnits(usdcBal, usdcDec)) },
    { currency: "ETH", free: Number(formatUnits(ethBal, 18)), used: 0, total: Number(formatUnits(ethBal, 18)) },
  ];

  return balances.filter((b) => b.total > 0);
}

/** 실제 온체인 USDC 잔고만 조회 (paper 모드 무관) */
export async function fetchWalletUsdcBalance(): Promise<number> {
  const client = getPublicClient();
  const wallet = getWalletAddress();
  const decimals = await getDecimals(chainConfig.tokens.USDC);
  const balance = await client.readContract({
    address: chainConfig.tokens.USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [wallet],
  });
  return Number(formatUnits(balance, decimals));
}

/** 실제 온체인 지갑 전체 잔고 조회 (WLD + USDC, USD 환산) */
export async function fetchWalletFullBalance(): Promise<{
  usdc: number;
  wld: number;
  wldPrice: number;
  wldValue: number;
  total: number;
}> {
  const client = getPublicClient();
  const wallet = getWalletAddress();

  const [usdcBal, wldBal, usdcDec, wldDec] = await Promise.all([
    client.readContract({ address: chainConfig.tokens.USDC, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
    client.readContract({ address: chainConfig.tokens.WLD, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
    getDecimals(chainConfig.tokens.USDC),
    getDecimals(chainConfig.tokens.WLD),
  ]);

  const usdc = Number(formatUnits(usdcBal, usdcDec));
  const wld = Number(formatUnits(wldBal, wldDec));

  // WLD 가격 조회
  let wldPrice = 0;
  if (wld > 0.001) {
    try {
      const ticker = await fetchTicker("WLD/USDC");
      wldPrice = ticker.last;
    } catch { /* 가격 조회 실패 시 0 */ }
  }

  const wldValue = wld * wldPrice;
  return { usdc, wld, wldPrice, wldValue, total: usdc + wldValue };
}

export async function fetchTicker(symbol: Symbol): Promise<Ticker> {
  const client = getPublicClient();
  const { base, quote } = symbolToTokens(symbol);
  const [baseDec, quoteDec] = await Promise.all([getDecimals(base), getDecimals(quote)]);

  // Quote 1 unit of base token → quote token price
  const amountIn = parseUnits("1", baseDec);
  const quoteResult = await client.readContract({
    address: chainConfig.uniswapQuoter,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: base,
        tokenOut: quote,
        amountIn,
        fee: 3000, // 0.3% fee tier
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const amountOut = (quoteResult as readonly [bigint, bigint, number, bigint])[0];

  const price = Number(formatUnits(amountOut, quoteDec));
  const now = Date.now();

  return {
    symbol,
    last: price,
    bid: price * 0.999, // approximate spread
    ask: price * 1.001,
    high: price, // single-point, no 24h data from quoter
    low: price,
    volume: 0, // will be filled from OHLCV if needed
    percentage: 0,
    timestamp: now,
  };
}

export async function fetchOHLCV(
  symbol: Symbol,
  timeframe: Timeframe,
  limit: number = 200
): Promise<OHLCV[]> {
  const pool = symbolToPool(symbol);
  const aggregate = timeframeToAggregate(timeframe);
  const timeframeType = timeframeToType(timeframe);

  // GeckoTerminal API: max 1000 per call
  const fetchLimit = Math.min(limit, 1000);
  const url = `https://api.geckoterminal.com/api/v2/networks/world-chain/pools/${pool}/ohlcv/${timeframeType}?aggregate=${aggregate}&limit=${fetchLimit}&currency=usd`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`GeckoTerminal API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const list = json?.data?.attributes?.ohlcv_list;

  if (!Array.isArray(list)) {
    return [];
  }

  // GeckoTerminal returns [timestamp_s, open, high, low, close, volume] newest-first
  const candles: OHLCV[] = list
    .map((c: number[]) => ({
      timestamp: c[0] * 1000, // convert s → ms
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }))
    .reverse(); // oldest first

  return candles;
}

export async function createOrder(
  order: OrderRequest
): Promise<OrderResult> {
  const { base, quote } = symbolToTokens(order.symbol as Symbol);
  const isBuy = order.side === "buy";
  const tokenIn = isBuy ? quote : base;
  const tokenOut = isBuy ? base : quote;

  const tokenInDecimals = await getDecimals(tokenIn);
  const tokenOutDecimals = await getDecimals(tokenOut);

  // For buy: quantity is in base token, we need to figure out amountIn in quote
  // For sell: quantity is in base token, that's our amountIn
  let amountIn: bigint;

  if (isBuy) {
    // First quote to find how much quote token we need for the desired base quantity
    const desiredOut = parseUnits(order.quantity.toString(), await getDecimals(base));
    // Use price estimate: amountIn ≈ quantity * price * 1.01 (1% buffer)
    const estimatedPrice = order.price ?? (await fetchTicker(order.symbol as Symbol)).last;
    amountIn = parseUnits((order.quantity * estimatedPrice * 1.01).toFixed(tokenInDecimals), tokenInDecimals);
  } else {
    amountIn = parseUnits(order.quantity.toString(), tokenInDecimals);
  }

  const client = getPublicClient();
  const wc = getWalletClient();
  const wallet = getWalletAddress();

  // Check and set allowance
  const currentAllowance = await client.readContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: "allowance",
    args: [wallet, chainConfig.uniswapRouter],
  });

  if (currentAllowance < amountIn) {
    const approveHash = await wc.writeContract({
      address: tokenIn,
      abi: erc20Abi,
      functionName: "approve",
      args: [chainConfig.uniswapRouter, amountIn * 2n], // approve 2x for buffer
      chain: worldChain,
      account: wc.account!,
    });
    await client.waitForTransactionReceipt({ hash: approveHash });
  }

  // Calculate minimum output (0.5% slippage)
  const swapQuoteResult = await client.readContract({
    address: chainConfig.uniswapQuoter,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut,
        amountIn,
        fee: 3000,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const quotedOut = (swapQuoteResult as readonly [bigint, bigint, number, bigint])[0];
  const amountOutMinimum = (quotedOut * 995n) / 1000n; // 0.5% slippage

  // Execute swap
  const swapHash = await wc.writeContract({
    address: chainConfig.uniswapRouter,
    abi: swapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut,
        fee: 3000,
        recipient: wallet,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      },
    ],
    chain: worldChain,
    account: wc.account!,
  });

  const receipt = await client.waitForTransactionReceipt({ hash: swapHash });

  // Calculate effective price
  const amountInNum = Number(formatUnits(amountIn, tokenInDecimals));
  const amountOutNum = Number(formatUnits(quotedOut, tokenOutDecimals));
  const effectivePrice = isBuy ? amountInNum / amountOutNum : amountOutNum / amountInNum;

  // Estimate gas fee in ETH
  const gasUsed = receipt.gasUsed ?? 0n;
  const gasPrice = receipt.effectiveGasPrice ?? 0n;
  const gasFeeEth = Number(formatUnits(gasUsed * gasPrice, 18));

  return {
    id: swapHash,
    symbol: order.symbol,
    side: order.side,
    price: effectivePrice,
    quantity: order.quantity,
    fee: gasFeeEth,
    timestamp: Date.now(),
  };
}

/** 지갑의 WLD 전량을 USDC로 스왑 (엔진 시작 시 호출) */
export async function swapAllWldToUsdc(): Promise<{ swapped: boolean; wldAmount: number; usdcReceived: number }> {
  const client = getPublicClient();
  const wallet = getWalletAddress();
  const wldDec = await getDecimals(chainConfig.tokens.WLD);

  const wldBal = await client.readContract({
    address: chainConfig.tokens.WLD,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [wallet],
  });

  const wldAmount = Number(formatUnits(wldBal, wldDec));

  // 0.01 WLD 미만이면 스왑 불필요
  if (wldAmount < 0.01) {
    return { swapped: false, wldAmount: 0, usdcReceived: 0 };
  }

  console.log(`[SwapAllWLD] ${wldAmount.toFixed(4)} WLD → USDC 스왑 시작`);

  const result = await createOrder({
    symbol: "WLD/USDC",
    side: "sell",
    type: "market",
    quantity: wldAmount,
  });

  const usdcReceived = result.quantity * result.price;
  console.log(`[SwapAllWLD] 완료: ${wldAmount.toFixed(4)} WLD → $${usdcReceived.toFixed(2)} USDC (가격: $${result.price.toFixed(4)})`);

  return { swapped: true, wldAmount, usdcReceived };
}

// --- Helpers ---

function timeframeToAggregate(tf: Timeframe): number {
  const map: Record<Timeframe, number> = { "1m": 1, "3m": 3, "5m": 5, "15m": 15 };
  return map[tf];
}

function timeframeToType(tf: Timeframe): "minute" | "hour" | "day" {
  // All our timeframes are minute-based
  return "minute";
}
