# Serving your own JWKS when your keys are symmetric (HMAC)

Both lacewing templates (`express-ts/base-backend-lacewing`, `bevd/base-lacewing`) sign
with an HMAC secret from the environment. When a second service needs to verify those
tokens, "point it at a JWKS endpoint" is the usual answer, and with symmetric keys it
publishes your signing key.

An asymmetric JWKS entry holds a public key, which only lets the reader verify. A
symmetric (`kty: "oct"`) entry holds the secret itself: the `k` field is your signing key,
base64url-encoded, not encrypted. Whoever can read the document can mint tokens.

Never serve `oct` keys from a public JWKS endpoint. A symmetric JWKS is a secret document;
distribute it like one.

lacewing will consume symmetric JWKS documents, and entropy-checks their entries like a
directly imported secret, but where the document lives is up to you. Three ways to do it,
safest first.

## Option 1: no endpoint

You control both services, so use the channel you already trust for `JWT_SECRET`, your
secret manager. Ship the JWKS document to the verifier out of band and inline it into the
profile:

```ts
import { defineProfile } from "lacewing";

// From your secret manager or encrypted env, the same channel JWT_SECRET
// already travels through. Not from a URL.
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
// store JSON.stringify(jwks) in the secret manager
```

You get the JWKS format (one document, several keys, readable by any consumer) without an
endpoint that has to be access-controlled forever.

## Option 2: an authenticated internal endpoint

If you need a URL (many consumers, frequent rotation, a secret manager not every service
can reach), treat the endpoint as a credentialed internal API that happens to serve JWKS.

Serving it from the Express template (the Elysia version is the same):

```ts
// src/routes/api/v1/jwks.routes.ts, not mounted on the public router
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

`requireServiceAuth` is whatever you already use between services: mTLS, a static bearer
token, a network policy that only admits the mesh. Without it you have published your
signing key.

To consume it, `createRemoteJWKSet` caches, refetches on rotation, applies fetch cooldowns
and caps the response size. It refuses non-HTTPS URLs and takes a `fetch` override, which
is where your credential goes:

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
pick out one key, and two indistinguishable candidates are treated as a configuration
error. lacewing's signer does not stamp a `kid` into the header yet, so two `HS256` `oct`
keys in one document (the usual old-key/new-key overlap) make verification of your own
tokens fail with `JWKSNoMatchingKey`.

Until your tokens carry a `kid`, rotate symmetric keys one of these ways:

- Hard cutover. Access tokens in these templates live 15 minutes; deploy the new secret
  everywhere and accept one token lifetime of 401s that clear on refresh.
- Rotate across algorithms. Move from `HS256` to `HS512` during the overlap, so selection
  is unambiguous, with both in `algorithms: [...]` while both are live.

## Option 3: asymmetric keys

The secret document, the authenticated endpoint and the fetch credential are all needed
because with HMAC every verifier can mint. With more than one verifying service, use a
key pair instead:

```ts
// Signer
import { exportKeyJWK, generateKeyPair } from "lacewing";
const { publicKey, privateKey } = await generateKeyPair("EdDSA", { extractable: true });
// serve { keys: [await exportKeyJWK(publicKey)] } on a public /jwks

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

The endpoint can be public, caching needs no auth, a leaked JWKS costs nothing, and
verifiers cannot mint. Use Options 1 and 2 only until you can do this.
