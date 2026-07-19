# Serving your own JWKS when your keys are symmetric (HMAC)

Both lacewing templates (`express-ts/base-backend-lacewing`, `bevd/base-lacewing`) sign
with an HMAC secret from the environment. At some point a second service needs to verify
those tokens, someone says "just point it at a JWKS endpoint", and this guide exists
because with symmetric keys that sentence hides a trap.

## The one thing to understand first

An asymmetric JWKS entry contains a *public* key: anyone may read it, because reading it
only lets you **verify**. A symmetric (`kty: "oct"`) JWKS entry contains **the secret
itself** - the `k` field is your signing key, base64url-encoded, not encrypted. Whoever
can read that document can *mint* tokens, not just check them.

So the rule is short:

> **Never serve `oct` keys from a public JWKS endpoint.** A symmetric JWKS is a secret
> document. Distribute it like one.

lacewing will happily *consume* symmetric JWKS documents - entries are entropy-checked
just like a directly imported secret - but where that document lives is your
responsibility. Three ways to do it, safest first.

## Option 1: no endpoint at all (recommended)

You control both services, and the "endpoint" was only ever a distribution mechanism -
so use the distribution mechanism you already trust: your secret manager. Ship the JWKS
*document* to the verifier out-of-band and inline it into the profile:

```ts
import { defineProfile } from "lacewing";

// From your secret manager / encrypted env - the same channel JWT_SECRET
// already travels through. NOT from a URL.
const jwks = JSON.parse(process.env.AUTH_JWKS!);

const profile = defineProfile({
	typ: "at+jwt",
	issuer: "https://auth.internal",
	audience: "https://api.internal",
	algorithms: ["HS256"],
	keys: jwks, // { keys: [{ kty: "oct", k: "...", alg: "HS256", use: "sig" }] }
	maxTokenAge: "15m",
});
```

To produce that document on the signing side, export the key you already have:

```ts
import { exportKeyJWK, importKey } from "lacewing";

const key = await importKey(process.env.JWT_SECRET!, "HS256");
const jwks = { keys: [await exportKeyJWK(key)] };
// -> store JSON.stringify(jwks) in the secret manager
```

This gets you the JWKS *format* (one document, multiple keys, works for every consumer)
without the JWKS *endpoint* (a URL that must now be access-controlled forever).

## Option 2: an authenticated internal endpoint

If you genuinely need a URL - many consumers, frequent rotation, a secret manager you
cannot reach from every service - treat the endpoint as what it is: a credentialed,
internal API that happens to speak JWKS.

Serving it (Express template shown; the Elysia version is the same idea):

```ts
// src/routes/api/v1/jwks.routes.ts - NOT mounted on the public router
import { Router } from "express";
import { exportKeyJWK } from "lacewing";
import { authKit } from "../../../config/lacewing";

const router = Router();

router.get("/", requireServiceAuth, async (_req, res) => {
	const { accessKey } = await authKit();

	res.json({ keys: [await exportKeyJWK(accessKey)] });
});

export default router;
```

`requireServiceAuth` is whatever your infra already uses between services - mTLS, a
static bearer token, network policy that only admits the mesh. Without it you have
published your signing key.

Consuming it: `createRemoteJWKSet` gives you caching, rotation refetch, fetch cooldowns
and a response-size cap for free. It refuses non-HTTPS URLs, and it takes a `fetch`
override, which is where your credential goes:

```ts
import { createRemoteJWKSet, defineProfile } from "lacewing";

const keys = createRemoteJWKSet("https://auth.internal/jwks", {
	fetch: (url, init) =>
		fetch(url, {
			...init,
			headers: { authorization: `Bearer ${process.env.JWKS_CLIENT_TOKEN}` },
		}),
});

const profile = defineProfile({
	typ: "at+jwt",
	issuer: "https://auth.internal",
	audience: "https://api.internal",
	algorithms: ["HS256"],
	keys,
	maxTokenAge: "15m",
});
```

## A caveat about rotation

lacewing's JWKS selection is exact: the token's algorithm (and `kid`, when present) must
single out **one** key, and two candidates with nothing to tell them apart is treated as
your configuration mistake, not something to guess at. lacewing's signer does not
currently stamp a `kid` into the header - so two `HS256` `oct` keys in the same document
(the classic old-key/new-key overlap) will make verification of your own tokens fail
with `JWKSNoMatchingKey`.

Until your tokens carry a `kid`, rotate symmetric keys one of these ways:

- **Hard cutover.** Access tokens in these templates live 15 minutes; deploy the new
  secret everywhere and accept one token-lifetime of 401s that resolve through refresh.
- **Rotate across algorithms.** `HS256` -> `HS512` during the overlap window: different
  algorithm, unambiguous selection, both in `algorithms: [...]` while both are live.

## Option 3: the actual fix - go asymmetric

Every constraint above - the secret document, the authenticated endpoint, the credential
for fetching it - exists because with HMAC **every verifier can mint**. The moment you
have more than one verifying service, that is usually the wrong trust shape, and the
20-minute fix is real keys:

```ts
// Signer
import { exportKeyJWK, generateKeyPair } from "lacewing";
const { publicKey, privateKey } = await generateKeyPair("EdDSA", { extractable: true });
// serve { keys: [await exportKeyJWK(publicKey)] } on a PUBLIC /jwks - it's a public key

// Verifier
const profile = defineProfile({
	typ: "at+jwt",
	issuer: "https://auth.internal",
	audience: "https://api.internal",
	algorithms: ["EdDSA"],
	keys: createRemoteJWKSet("https://auth.internal/jwks"), // no credential needed
	maxTokenAge: "15m",
});
```

Now the endpoint can be public, caching needs no auth story, a leaked JWKS costs you
nothing, and verifiers can never mint. This is the paved road; Options 1 and 2 are for
when you cannot take it yet.

## Summary

| Situation | Do this |
| --- | --- |
| One service signs and verifies | What the templates already do: env secret, no JWKS. |
| Few internal verifiers, HMAC must stay | **Option 1**: JWKS document via the secret manager, inlined into the profile. |
| Many verifiers / URL-based distribution, HMAC must stay | **Option 2**: authenticated HTTPS endpoint + `createRemoteJWKSet` with a credentialed `fetch`. |
| More than one verifier, no hard constraint | **Option 3**: EdDSA key pair, public JWKS endpoint. |
| Symmetric keys on a public JWKS endpoint | Never. That is the signing key. |
