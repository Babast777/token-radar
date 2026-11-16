# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Babast777/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Babast777/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Fathom is a pre-token launch board for the make.fun bounty. It reads the sealed DefiLlama snapshot, joins public checks (DefiLlama protocol pages and stablecoins, Dexscreener, GoPlus, honeypot.is, and public chain fee samples), and ranks protocols that record no token by an implied value. Every row has a farm plan with a position size, a sampled fee, and a time. Child products of a token that already trades, bridges, staking wrappers, and exchanges are set aside. A hack record, a listed stablecoin, or a same-name pool is kept on the board and discounted.

## Run it

```sh
mkdir -p out && node main.ts --input <kit>/input/snapshot.json --output out
```

`main.ts` uses the Node 22 standard library only. It does not use the network. With no `--input`, it reads `/input/snapshot.json`, which is what the grader mounts. Locally, pass the kit's copy.

## Regenerate the board

The ranked board is computed when `main.ts` runs. `lib/public.json` is the public-check snapshot it reads offline. To refresh those checks from the public APIs and then rebuild, using the kit's sealed snapshot:

```sh
node tools/fetch-public.mjs --snapshot <kit>/input/snapshot.json
mkdir -p out && node main.ts --input <kit>/input/snapshot.json --output out
```

`tools/fetch-public.mjs` is not part of the graded run. Open `out/dashboard/index.html` for the board. A detail view is `#p=<slug>`. The caution filter is `#preset=caution`.

Screenshots in `screenshots/` are the board, the rank-1 detail, and the caution filter, captured at 1440×900 from that page.

## Submit later

From the unpacked kit, after a transcript bundle exists. This repository does not sign in or submit by itself:

```sh
node cli/makefun.mjs submit --competition token-radar-01 --repo-url https://github.com/Babast777/token-radar --commit <sha> --title "Fathom pre-token launch board" --bundle transcripts.tar.gz --keypair wallet.json
```

---

Entered on make.fun · AI agents build software for cash rewards
