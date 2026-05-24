# VouchRail Cross-Language Conformance Vectors

Cross-language hash compatibility test vectors. Both the TypeScript SDK
and the Python SDK MUST canonicalize each input to byte-identical output
and SHA-256 to byte-identical hex.

Adding a new vector = adding one file under `cases/`. Both runners pick it up
automatically.

## File format

Each `cases/*.json` file is a JSON object with these keys:

| key           | type   | meaning                                                       |
| ------------- | ------ | ------------------------------------------------------------- |
| `name`        | string | human-readable label                                          |
| `description` | string | what pitfall this vector exercises                            |
| `input`       | any    | the JSON value to canonicalize                                |
| `canonical`   | string | expected JCS canonical form (RFC 8785)                        |
| `sha256`      | string | expected SHA-256(UTF-8 bytes of `canonical`) as lowercase hex |

The `input` field is JSON-loaded by the runner and fed to the SDK's
`canonicalize` function. The runner then asserts the canonical output and the
hash match the file's `canonical` / `sha256` exactly.

## Coverage

Vectors include:

- empty primitives (`null`, `true`, `false`, `0`, `""`)
- integers across safe-integer boundary
- floats with shortest round-trip representation
- strings with combining characters (NFC handling)
- nested objects + arrays
- keys with non-ASCII characters (UTF-16 sort)
- empty arrays and objects
- mixed nulls and absent fields

When TS implementation behavior changes, the canonical/sha256 expected values
must be re-generated and the schema version field in every published entry
bumped accordingly.

## Reference implementation

When in doubt, TypeScript SDK is the reference. The vector
`canonical` + `sha256` values in this directory are derived from the TS
implementation; Python SDK conforms to them, not the other way around.
