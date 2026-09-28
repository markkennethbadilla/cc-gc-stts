# 007 - A request nobody answers is released, so the voice window cannot wedge

## What it does

Bounds how long a request may occupy the voice window. When a request gets no
answer inside that bound, the daemon releases it and the caller is told, so the
next `stt` or `tts` call on any agent works instead of being refused with "the
stts daemon is busy with another request".

## Why it exists

The daemon holds **one** pending request at a time: a second `/request` while one
is in flight is answered `409 busy`. So one request that is heard by nobody makes
the voice window unusable everywhere, and only a restart clears it.

That is not hypothetical. On 2026-09-24 a long `tts` with `listen` was spoken into
an empty room. The agent's tool call hung, the gateway gave up at its ~300-second
ceiling, and every later call answered `busy`. The daemon was killed by hand.

Nothing bounded it. Two mechanisms looked like they should have:

- **The call's own clock.** There was none: `postRequest` waited forever.
- **The release when the caller goes away.** The daemon clears the pending request
  on `req.on('close')`, which reads like it covers a caller that gives up. It does
  not: probed against the real daemon on 2026-09-24, a client that destroyed its
  request left the request pending for at least twenty seconds, and the next call
  was still refused. A socket closing is not a fact this daemon can rely on.

So the bound has to be the daemon's own, and both ends carry it.

## How it works

Both the daemon and the client use `REQUEST_TIMEOUT_MS`: **240 seconds**, or
`STTS_REQUEST_TIMEOUT_MS` when that is set.

- **The daemon** (`stts-daemon.ts`) starts a watchdog when it accepts a request.
  On expiry it clears the pending request, so the daemon is free immediately. A
  speaking request is answered `504` with the reason. A listen is not failed: it
  is answered `__STTS_LISTEN_CONTINUES__` and the page keeps what it heard
  (spec 012).
- **The client** (`daemon-client.ts`) waits five seconds longer than the daemon,
  so the daemon's answer wins; if the daemon never answers, the client destroys
  the request and the agent gets a failed tool call instead of a hang.
- Since spec 012 the 240 seconds are the budget of one whole tool call: a `tts`
  and its listen share it, so the pair still returns before the gateway gives up.
- A `res.on('close')` release sits beside the original `req.on('close')` one, for
  the cases where the socket does close. It is a bonus, not the guarantee.

240 seconds is set by the gateway, not chosen for taste: MCPJungle drops a tool
call at about 300 seconds, and the client must give up **first**, while it is
still alive to report the failure, leaving the daemon free either way.

What happens to speech at the bound, and to long content, is spec 012 and
spec 013: a listen continues instead of failing, and long text is read in parts.

## What it reads and writes

- `STTS_REQUEST_TIMEOUT_MS` — optional. Overrides the 240-second default on both
  ends, for a live check. Unset in normal use.
- It writes nothing. It stops waiting.

## How to run, check, and hand over

```
npm run build                     # dist/ is what runs; src alone changes nothing
node --test test/request-timeout.test.mjs
```

The test starts a server that accepts and never answers — the shape of a `listen`
nobody replies to — and asserts both that the call gives up inside the bound and
that the connection really closes. The connection closing is checked because it is
what the daemon's release path listens for, and the daemon's own watchdog is what
covers the case where it does not.

Live check, which is how this was proved: with `STTS_REQUEST_TIMEOUT_MS=5000`,
bring the daemon up with a call that completes, then ask for an `stt` and answer
nothing, then make a real call. Observed:

```
open call dropped after 5013ms -> no answer from the voice window within 5s; ...
probe 1 (+9s): FREE, ""
```

Before the watchdog the same probe printed `stts daemon is busy with another
request` on every probe and never freed.

Hand over: this spec, `src/daemon-client.ts`, `src/stts-daemon.ts`,
`test/request-timeout.test.mjs`.
