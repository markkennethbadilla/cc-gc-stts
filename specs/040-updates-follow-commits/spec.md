# Updates follow commits

## What it does
Every pushed commit to main reaches installed copies of the plugin on the next `claude plugin update stts@stts-marketplace`.

## Why it exists
A pinned `"version": "1.0.0"` made Claude Code report "already at latest" forever, so the mic picker (fcdf79e) never arrived without an uninstall and reinstall.

## How it works
Neither `.claude-plugin/plugin.json` nor `.claude-plugin/marketplace.json` sets `version`. Per the Claude Code plugin docs, Claude Code then uses the git commit SHA (12 characters) as the version. Never add a `version` field back.

## What it reads and writes
Reads the two manifests. Installed copies live in `~/.claude/plugins/cache/stts-marketplace/stts/<sha>/`.

## How to run, check, and hand over
Run `claude plugin marketplace update stts-marketplace` then `claude plugin update stts@stts-marketplace`. After a new commit it must report an update, not "already at latest".
