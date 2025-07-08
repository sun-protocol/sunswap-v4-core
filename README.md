# sun-studio-demo
sun-studio-demo

## ENV

```
node >= v22.14.0
npm >= 10.9.2
@sun-protocol/sun-studio >= 0.2.2

```
## How To Use SunStudio

### Installation

```
npm install 

```
### Hardhat Configuration
in `hardhat.config.ts`, you can configure the parameters for the compiler and networks.

**compilers:**

You can compile using different versions of the Solidity and Vyper compilers simultaneously. 

```
solidity: {
    compilers: [ // different versions of the Solidity
      { "version": "0.8.23", settings },
      { "version": "0.8.22", settings },
    ]
  },
  vyper: { 
    compilers: [ // different versions of the Vyper
      { "version": "0.2.8" },
      { "version": "0.3.10" }
    ]
  },
```

**networks:**

You can add the Tron network and other EVM-compatible networks.

```
networks: {
    localhost: {
      live: false,
      saveDeployments: true,
      tags: ["local"],
      deploy: ['deploy/'],
    },
    tron: {
      url: "https://nile.trongrid.io/jsonrpc",
      tron: true,
      deploy: ['deployTron/'],
      accounts: [`${process.env.PRIVATE_KEY}`],
    },
    sepolia: {
      url: "https://sepolia.drpc.org",
      tron: false,
      deploy: ['deploy/'],
      accounts: [`${process.env.PRIVATE_KEY}`],
    }
  }
```

**others**

tronSolc support

```
  tronSolc: {
    enable: true, //if using the tronSolc
  },
```

namedAccount

```
namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
    }
  }
```

### Compile

```
npx hardhat compile

```
or

```
npm run compile
```

### Unit-Test

#### hardhat test

```
npx hardhat test
```
or
```
npm run test
```
#### foundry test
Initial foundry:
```
npm run init-foundry
```
Run test
```
npm run test-foundry
```

### Deploy

Rewrite the `deploy/` or `deployTron/` scripts to deploy contracts, and run

```
npx hardhat deploy --network xxx --tags xxxx
```
or 
```
npm run deploy-tron   // tron network  
npm run deploy        // EVM-compatible network
```

You can check deployed contracts in `deployments/network/contractName.json`
