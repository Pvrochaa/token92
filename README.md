# TOKEN 92 ($T92)

The reactor powered by the community. A static site for a Solana memecoin:
it reads the Solana blockchain and Dexscreener directly in the browser, no
backend or database involved.

## Structure

```
index.html     the page markup
css/style.css  all styling
js/app.js      all behavior, including the CONFIG block below
img/           favicons, social preview image, the original logo
archive/       superseded versions, kept for reference
```

No build step, no dependencies — open `index.html` in a browser, or deploy
the folder as-is to any static host (it's already wired up for Vercel).

## Setup

All configuration lives in the `CONFIG` object at the top of `js/app.js`.
At minimum, fill in:

- `MINT_ADDRESS` — the $T92 mint address, once it exists on pump.fun.
- `TREASURY_ADDRESS` / `DEV_ADDRESS` / `LIQUIDITY_ADDRESS` — public wallet
  addresses (never private keys) to display and monitor. Buys made from the
  dev or treasury wallet don't count toward the reactor's fill bar, so the
  community's own activity is what the core actually reflects.

Everything else (`FISSION_VOLUME_TARGET`, `MAX_BUY_IMPACT`, `BURN_TARGET`,
`LORE_UNLOCK_AT`, RPC settings, poll intervals) has inline comments
explaining what it controls and how to tune it.

### RPC key

`RPC_URL` currently points at a Helius key. It's a client-side key, visible
to anyone who views the page source — that's unavoidable for a backend-less
static site. The real protection is restricting it to the `token92.vercel.app`
domain in the Helius dashboard, so a copied key can't be used anywhere else.

## What it does

- Renders a 92-rod reactor core that fills up based on real community buy
  volume on the $T92 mint, detected on-chain regardless of which exchange
  (Axiom, pump.fun, Jupiter...) the trade went through.
- Reads live price, 24h change, volume and liquidity from the Dexscreener
  public API once a trading pair exists for the mint.
- Reads circulating supply and real burn ("Fission") history directly via
  Solana JSON-RPC, with each burn's transaction hash linked out to an
  explorer.
- Unlocks a 4th lore chapter once 25 real burns have been detected on-chain.
- A clickable coin in the hero flips to an engraved message; a rarer one
  appears every 9th flip.

## Disclaimer

$T92 is a memecoin made for entertainment and community, with no promised
financial utility. Nothing in this repository or the deployed site is
investment advice.
