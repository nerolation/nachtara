export const SCHEME_ID = 1n; // SECP256k1 with view tags
export const SUPPORTED_NETWORKS = {
    mainnet: {
        chainId: 1,
        name: 'Ethereum Mainnet',
        rpcUrl: 'https://eth.llamarpc.com',
        blockExplorer: 'https://etherscan.io'
    },
    sepolia: {
        chainId: 11155111,
        name: 'Sepolia Testnet',
        rpcUrl: 'https://rpc.sepolia.org',
        blockExplorer: 'https://sepolia.etherscan.io'
    },
    holesky: {
        chainId: 17000,
        name: 'Holesky Testnet',
        rpcUrl: 'https://ethereum-holesky-rpc.publicnode.com',
        blockExplorer: 'https://holesky.etherscan.io'
    },
    arbitrum: {
        chainId: 42161,
        name: 'Arbitrum One',
        rpcUrl: 'https://arb1.arbitrum.io/rpc',
        blockExplorer: 'https://arbiscan.io'
    },
    optimism: {
        chainId: 10,
        name: 'Optimism',
        rpcUrl: 'https://mainnet.optimism.io',
        blockExplorer: 'https://optimistic.etherscan.io'
    },
    base: {
        chainId: 8453,
        name: 'Base',
        rpcUrl: 'https://mainnet.base.org',
        blockExplorer: 'https://basescan.org'
    },
    polygon: {
        chainId: 137,
        name: 'Polygon',
        rpcUrl: 'https://polygon-rpc.com',
        blockExplorer: 'https://polygonscan.com'
    }
};
// Contract addresses (singleton deployments per ERC-5564/6538)
export const ERC5564_ANNOUNCER = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';
export const ERC6538_REGISTRY = '0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538';
// StealthForwarder - atomic send + announce
export const STEALTH_FORWARDER = {
    11155111: '0x594c5b0e28a1ae14bf92b6f8b42d1dc5cc801b1b', // Sepolia
};
// Start blocks for each network (when contracts were deployed)
export const START_BLOCKS = {
    1: 20042207n, // Mainnet
    11155111: 5486597n, // Sepolia
    17000: 1222405n, // Holesky
    42161: 219468264n, // Arbitrum
    10: 121097390n, // Optimism
    8453: 15502414n, // Base
    137: 57888814n // Polygon
};
//# sourceMappingURL=types.js.map