# SunSwap V4 Core

SunSwap V4 Core is the core contracts repository of the SunSwap protocol. It is built with Hardhat and Foundry, and supports development, testing, and deployment on Tron networks.

## Deployments

|contract |chain|address|
|:---|:---|:---|
|PoolManager|TRON|TVjuTE3V5bMVdpfNhid8kD2v35T2k1u1Br|
||NILE|TVivLPeq7FMmTG8Z7HaiBgHTsMwCEcipKT|
|protocolFeeController|TRON|TEays9UfJn2EqKjkN7hWUWewBGpGxTzWEv|
||NILE|TDch7PxQNbsuCQpzPd2LK7htR5qB3wvdtF|


## Environment (ENV)

```text
node >= v22.14.0
npm >= 10.9.2
@sun-protocol/sun-studio >= 0.2.2
```

## Compile, Test and Deploy

### Installation

```bash
npm install
```

### Hardhat Configuration

In `hardhat.config.ts`, you can configure compiler options, networks, and other settings.

**compilers**

You can use multiple versions of the Solidity and Vyper compilers at the same time:

```ts
solidity: {
  compilers: [
    { version: "0.8.26", settings },
  ],
},
```

**networks**

You can add the Tron network and other EVM-compatible networks, for example:

```ts
networks: {
  localhost: {
    live: false,
    saveDeployments: true,
    tags: ["local"],
    deploy: ["deploy/"],
  },
  tron: {
    url: "https://nile.trongrid.io/jsonrpc",
    tron: true,
    deploy: ["deployTron/"],
    accounts: [`${process.env.PRIVATE_KEY}`],
  },
  sepolia: {
    url: "https://sepolia.drpc.org",
    tron: false,
    deploy: ["deploy/"],
    accounts: [`${process.env.PRIVATE_KEY}`],
  },
}
```

**Other options**

`tronSolc` support:

```ts
tronSolc: {
  enable: true, // if using tronSolc
},
```

`namedAccounts` for configuring deployer accounts:

```ts
namedAccounts: {
  deployer: {
    default: 0, // by default take the first account as deployer
  },
}
```

### Compile

```bash
npx hardhat compile
```

or:

```bash
npm run compile
```

### Unit Tests

#### Hardhat tests

```bash
npx hardhat test
```

or:

```bash
npm run test
```

#### Foundry tests

Initialize Foundry:

```bash
npm run init-foundry
```

Run Foundry tests:

```bash
npm run test-foundry
```

### Deploy

Adapt the scripts under `deploy/` or `deployTron/` as needed to deploy the contracts, then run:

```bash
npx hardhat deploy --network <network> --tags <tag>
```

or use npm scripts:

```bash
npm run deploy-tron   # Tron network
npm run deploy        # other EVM-compatible networks
```

After deployment, you can check deployed contract info at:

```text
deployments/<network>/<contractName>.json
```
