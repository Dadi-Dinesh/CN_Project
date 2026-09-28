# Private Network Service Platform

A fully local private service network built on two macOS laptops for our **Computer Networks** course project. There is no cloud and no pre-configured server; every part of the network is set up by hand on our own machines.

> **Core principle:** the application stays simple, the network is the project.

## Project Outcome

By the end of the project, a client machine on our private Wi-Fi will be able to:

- **Type a private domain name** (e.g. `app.team1.test`) into a browser or `curl`
- **Resolve that name** through our own DNS server instead of a public one
- **Connect securely over HTTPS** through our nginx reverse proxy, using a certificate signed by our own local CA
- **Get a response from one of two backend servers**, with requests load-balanced between Backend A and Backend B
- **Observe every step of that journey** (DNS → TCP → TLS → HTTP) using Wireshark, `dig`, `curl` and browser DevTools

The network will also be made resilient: it will keep working when a backend or the primary DNS server fails, isolate the backends behind the edge server, and be diagnosable layer by layer when faults are injected.

## Current Structure

```
CN_Project/
├── backendA/
│   ├── server.js        # Express server for Backend A (port 4000)
│   ├── package.json
│   └── package-lock.json
├── backendB/
│   ├── server.js        # Express server for Backend B (port 5000)
│   ├── package.json
│   └── package-lock.json
├── .gitignore           # ignores node_modules in both backends
└── README.md
```

Each backend is a simple Express app. `GET /` returns a plain-text message saying which backend responded.

### Running a backend

```bash
cd backendA        # or backendB
npm install
npm start
```

DNS and nginx configuration, TLS certificate setup, documentation and packet-capture evidence will be added as the project progresses.
