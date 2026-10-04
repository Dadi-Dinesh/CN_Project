# Generating the local CA and server certificate

Run on Mac 2 inside `certs/`. Uses Homebrew OpenSSL (`brew install openssl@3`).

```bash
O=$(brew --prefix openssl@3)/bin/openssl

# 1. Local Certificate Authority
$O req -x509 -new -nodes -newkey rsa:2048 -days 365 -keyout ca.key -out ca.crt \
  -subj "/CN=Team1 Local CA" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"

# 2. Server key + certificate signing request
$O req -new -nodes -newkey rsa:2048 -keyout app.team1.test.key -out app.csr -subj "/CN=app.team1.test"

# 3. Sign it with the CA, adding the SAN names (san.ext)
$O x509 -req -in app.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 365 -sha256 \
  -extfile san.ext -out app.team1.test.crt

# 4. Inspect
$O x509 -in app.team1.test.crt -noout -subject -issuer -dates -ext subjectAltName
```

Install for nginx:
```bash
mkdir -p /opt/homebrew/etc/nginx/certs
cp app.team1.test.crt app.team1.test.key /opt/homebrew/etc/nginx/certs/
```

Trust the CA on each client (only `ca.crt` ever leaves Mac 2):
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ca.crt
```

`ca.key`, `app.team1.test.key`, `app.csr` and `ca.srl` stay on Mac 2 and are excluded by `.gitignore`.
