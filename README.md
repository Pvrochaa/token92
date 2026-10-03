# TOKEN 92 ($T92)

The reactor powered by the community. A single-file, static site for a Solana
memecoin: it reads the Solana blockchain and Dexscreener directly in the
browser, no backend or database involved.

**Live file:** [`index.html`](index.html) (identical to `token92-completo-real.html`,
kept as the root page so the site works when deployed as-is).

## What it does

- Renders a 92-rod reactor core that fills up based on real community buy
  volume on the $T92 mint (detected on-chain, regardless of which exchange —
  Axiom, pump.fun, Jupiter — the trade went through).
- Reads live price, 24h change, volume and liquidity from the Dexscreener
  public API once a trading pair exists for the mint.
- Reads circulating supply and real burn ("Fission") history directly via
  Solana JSON-RPC, with each burn's transaction hash linked out to an
  explorer.
- Unlocks a 4th lore chapter once 25 real burns have been detected on-chain.
- No build step, no dependencies — open `index.html` in a browser, or deploy
  the folder as-is to any static host.

## Setup

All configuration lives in the `CONFIG` object at the top of the `<script>`
tag in `index.html`. At minimum, fill in:

- `MINT_ADDRESS` — the $T92 mint address, once it exists on pump.fun.
- `TREASURY_ADDRESS` / `DEV_ADDRESS` / `LIQUIDITY_ADDRESS` — public wallet
  addresses (never private keys) to display and monitor.

Everything else (`FISSION_VOLUME_TARGET`, `MAX_BUY_IMPACT`, `BURN_TARGET`,
`LORE_UNLOCK_AT`, RPC settings, poll intervals) has inline comments
explaining what it controls and how to tune it.

The public Solana RPC works for testing but is rate-limited; for production
traffic, use a free [Helius](https://www.helius.dev) API key.

## Disclaimer

$T92 is a memecoin made for entertainment and community, with no promised
financial utility. Nothing in this repository or the deployed site is
investment advice.
