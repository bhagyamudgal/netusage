# netusage

Monthly wifi and hotspot usage, split by direct and ProtonVPN traffic. Samples `netstat` interface counters once a minute via launchd and accumulates deltas into billing cycles.

## What it tracks

| | direct | VPN (Proton) |
|---|---|---|
| wifi | en0 minus VPN share | utun share of en0 |
| hotspot | en0 minus VPN share | utun share of en0 |

en0 is the shared pipe, so each sample splits its delta. Tailscale (utun9, 100.64.0.0/10) counts as direct. Full-tunnel ProtonVPN attributes the whole en0 delta to VPN. Split-tunnel attributes the utun delta, capped at the en0 delta. Network comes from the default route: the iPhone USB hotspot gateway (172.20.10.1) means hotspot, anything else on wifi means wifi. Billing cycles start on day 1 of the month in local time. Cycles started under the old day-4 default keep their existing `...-04` keys and still show up in report output.

## Requirements

macOS and Bun.

## Install

```sh
bash scripts/install.sh
```

Setup runs in one of four modes:

```sh
bash scripts/install.sh --billing-day 1 --interval 60
bash scripts/install.sh
bash scripts/install.sh --interactive
bash scripts/install.sh --yes --no-bootstrap
```

The first passes every value as flags, so nothing is asked. The second asks for the billing day only and defaults everything else. The third walks through billing day, hotspot gateway, Tailscale CIDR, and interval. The fourth accepts all defaults without asking, for automation. Without `--yes`, the billing-day prompt appears only when stdin is a TTY and `--billing-day` was not passed; piped runs silently keep the default. Explicit flags beat prompt answers, answers beat env vars, env vars beat built-in defaults.

| Setting | Flag | Env | Default |
|---|---|---|---|
| Billing day | `--billing-day N` | `NETUSAGE_BILLING_DAY` | `1` |
| Hotspot gateway | `--hotspot-gateway IP` | `NETUSAGE_HOTSPOT_GATEWAY` | `172.20.10.1` |
| Tailscale CIDR | `--tailscale-cidr CIDR` | `NETUSAGE_TAILSCALE_CIDR` | `100.64.0.0/10` |
| Sample interval | `--interval SEC` | `NETUSAGE_INTERVAL_SEC` | `60` |
| Shim dir | `--bin-dir DIR` | | `$HOME/.local/bin` |

The installer copies the app to `~/.netusage/app`, runs `bun install` there, writes `~/Library/LaunchAgents/com.bhagya.netusage.plist`, loads it, and installs a `netusage` shim. Billing day must be 1-28 and interval must be positive.

## Fetch usage

```sh
netusage report
netusage sample
```

The shim lives at `~/.local/bin/netusage`. If that dir is not on PATH, use the full path:

```sh
bun $HOME/.netusage/app/src/cli.ts report
```

Raw data is JSON at `~/.netusage/usage.json`:

```sh
cat ~/.netusage/usage.json
jq '.cycles' ~/.netusage/usage.json
```

Report prints every cycle newest-first with GB totals, where 1 GB is 1e9 bytes. The first sample only records baselines, so usage starts accruing from the second sample on.

## Uninstall

```sh
bash scripts/install.sh --uninstall
```

This removes the plist, the app dir, and the shim, and keeps `usage.json` and `error.log`. Add `--wipe-data` to remove those too.

## Troubleshooting

The `~/.local/bin/bun` entry is an sfw-shim that fails under the launchd PATH. The installer skips shims and bakes the real bun binary into the plist ProgramArguments. If samples stop after a Bun reinstall, check the plist points at a working binary.

Exit 127 from a sample means bun was not found at the baked path. Re-run the installer, optionally with `--bun` pointing at the real binary.

When the network is neither wifi nor hotspot, the sample saves baselines only and counts nothing. Counters that reset (reboot, interface flap) are clamped at zero instead of going negative.

A corrupt store fails loudly instead of resetting. The error lands in `~/.netusage/error.log`. Inspect `usage.json` with `jq empty` to confirm, then either fix the JSON or delete the file to start over (deleting loses history).
