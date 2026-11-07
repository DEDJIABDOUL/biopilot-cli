# Releasing BioPilot CLI

## Publish a version

1. On a branch, set the version in `package.json` and `package-lock.json` (`npm version X.Y.Z --no-git-tag-version`) and add its notes to `CHANGELOG.md`. Merge it into `main` once CI is green.
2. Tag the merge commit on `main` and push the tag:

   ```shell
   git tag -a vX.Y.Z -m "BioPilot CLI X.Y.Z"
   git push origin vX.Y.Z
   ```

3. The `Release` workflow (`.github/workflows/release.yml`) checks that the tag matches `package.json`, builds the standalone binary on each platform (Linux x64 and arm64, macOS arm64 and x64), checks that each answers from its embedded Catalog, compresses them, writes `SHA256SUMS`, signs it as `SHA256SUMS.sig`, and publishes everything with `install.sh` as a GitHub Release.

The install command always installs the latest release.

## The release signing key

`install.sh` trusts a release only when its `SHA256SUMS` is signed by the release key. The key is an ECDSA P-256 key pair:

- the **public key** is in [`scripts/release-signing-key.pub.pem`](../scripts/release-signing-key.pub.pem) and written into `install.sh` (a test checks that both are the same);
- the **private key** is the repository secret `BIOPILOT_RELEASE_SIGNING_KEY`, used only by the release workflow, which also checks the signature against the public key before publishing. Keep an offline copy; never commit it.

Set or replace the secret from a terminal where the GitHub CLI is logged in:

```shell
gh secret set BIOPILOT_RELEASE_SIGNING_KEY < path/to/release-signing-key.pem
```

### Replace the key

If the private key is lost or exposed:

1. Make a new pair:

   ```shell
   openssl ecparam -name prime256v1 -genkey -noout -out release-signing-key.pem
   openssl ec -in release-signing-key.pem -pubout -out release-signing-key.pub.pem
   ```

2. Put the new public key in `scripts/release-signing-key.pub.pem` and in `install.sh` (`RELEASE_PUBLIC_KEY`), set the new private key as the secret, and merge.
3. Sign the existing releases again, so that `BIOPILOT_VERSION` keeps working for them:

   ```shell
   gh release download vX.Y.Z -p SHA256SUMS
   openssl dgst -sha256 -sign release-signing-key.pem -out SHA256SUMS.sig SHA256SUMS
   gh release upload vX.Y.Z SHA256SUMS.sig --clobber
   ```
