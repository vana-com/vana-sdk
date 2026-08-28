// THIS FILE IS GENERATED, DO NOT EDIT MANUALLY
// Run `npm run fetch-abis` to regenerate
//
// DataPortabilityServers Implementation Contract
//
// Generated: 2026-08-28T19:59:10.373Z
// Network: Vana (Chain ID: 1480)
//
//   Proxy Address:
//     0xCae2CE0e9caa6643ed28186cF57bd40Bd9E17Eab
//     https://vanascan.io/address/0xCae2CE0e9caa6643ed28186cF57bd40Bd9E17Eab
//
//   Implementation Address:
//     0x97537454751eE1A649C92Ac1BA7D0E4a9E90D1fd
//     https://vanascan.io/address/0x97537454751eE1A649C92Ac1BA7D0E4a9E90D1fd

export const DataPortabilityServersABI = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "AccessControlBadConfirmation",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "neededRole",
        type: "bytes32",
      },
    ],
    name: "AccessControlUnauthorizedAccount",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address",
      },
    ],
    name: "AddressEmptyCode",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "serverId",
        type: "bytes32",
      },
    ],
    name: "AlreadyRevoked",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "currentTime",
        type: "uint256",
      },
    ],
    name: "DeadlineExpired",
    type: "error",
  },
  {
    inputs: [],
    name: "ECDSAInvalidSignature",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "length",
        type: "uint256",
      },
    ],
    name: "ECDSAInvalidSignatureLength",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "s",
        type: "bytes32",
      },
    ],
    name: "ECDSAInvalidSignatureS",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address",
      },
    ],
    name: "ERC1967InvalidImplementation",
    type: "error",
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error",
  },
  {
    inputs: [],
    name: "EmptyPublicKey",
    type: "error",
  },
  {
    inputs: [],
    name: "EmptyUrl",
    type: "error",
  },
  {
    inputs: [],
    name: "EnforcedPause",
    type: "error",
  },
  {
    inputs: [],
    name: "ExpectedPause",
    type: "error",
  },
  {
    inputs: [],
    name: "FailedInnerCall",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidSignature",
    type: "error",
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "serverId",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "claimed",
        type: "address",
      },
      {
        internalType: "address",
        name: "actual",
        type: "address",
      },
    ],
    name: "NotServerOwner",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "claimed",
        type: "address",
      },
      {
        internalType: "address",
        name: "recovered",
        type: "address",
      },
    ],
    name: "OwnerMismatch",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "serverAddress",
        type: "address",
      },
    ],
    name: "ServerAlreadyRegistered",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "serverId",
        type: "bytes32",
      },
    ],
    name: "ServerNotFound",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "expected",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "provided",
        type: "bytes32",
      },
    ],
    name: "StaleServerId",
    type: "error",
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32",
      },
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error",
  },
  {
    inputs: [],
    name: "ZeroAddress",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [],
    name: "EIP712DomainChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64",
      },
    ],
    name: "Initialized",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "Paused",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "previousAdminRole",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "newAdminRole",
        type: "bytes32",
      },
    ],
    name: "RoleAdminChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
    ],
    name: "RoleGranted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
    ],
    name: "RoleRevoked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "serverId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "ownerAddress",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "serverAddress",
        type: "address",
      },
    ],
    name: "ServerDeregistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "serverId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "ownerAddress",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "serverAddress",
        type: "address",
      },
      {
        indexed: false,
        internalType: "string",
        name: "publicKey",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "serverUrl",
        type: "string",
      },
    ],
    name: "ServerRegistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "Unpaused",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address",
      },
    ],
    name: "Upgraded",
    type: "event",
  },
  {
    inputs: [],
    name: "DEFAULT_ADMIN_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MAINTAINER_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "SERVER_DEREGISTRATION_TYPEHASH",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "SERVER_REGISTRATION_TYPEHASH",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "serverAddress",
        type: "address",
      },
    ],
    name: "activeServerId",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "serverAddress",
        type: "address",
      },
      {
        internalType: "string",
        name: "publicKey",
        type: "string",
      },
      {
        internalType: "string",
        name: "serverUrl",
        type: "string",
      },
    ],
    name: "computeServerId",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "ownerAddress",
            type: "address",
          },
          {
            internalType: "address",
            name: "serverAddress",
            type: "address",
          },
          {
            internalType: "bytes32",
            name: "serverId",
            type: "bytes32",
          },
          {
            internalType: "uint256",
            name: "deadline",
            type: "uint256",
          },
        ],
        internalType: "struct IDataPortabilityServersV2.ServerDeregistration",
        name: "input",
        type: "tuple",
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes",
      },
    ],
    name: "deregisterServerWithSignature",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "domainSeparator",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "eip712Domain",
    outputs: [
      {
        internalType: "bytes1",
        name: "fields",
        type: "bytes1",
      },
      {
        internalType: "string",
        name: "name",
        type: "string",
      },
      {
        internalType: "string",
        name: "version",
        type: "string",
      },
      {
        internalType: "uint256",
        name: "chainId",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "verifyingContract",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "salt",
        type: "bytes32",
      },
      {
        internalType: "uint256[]",
        name: "extensions",
        type: "uint256[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "serverAddress",
        type: "address",
      },
    ],
    name: "getActiveServerByAddress",
    outputs: [
      {
        components: [
          {
            internalType: "bytes32",
            name: "id",
            type: "bytes32",
          },
          {
            internalType: "address",
            name: "ownerAddress",
            type: "address",
          },
          {
            internalType: "address",
            name: "serverAddress",
            type: "address",
          },
          {
            internalType: "string",
            name: "publicKey",
            type: "string",
          },
          {
            internalType: "string",
            name: "serverUrl",
            type: "string",
          },
          {
            internalType: "uint256",
            name: "registeredAtBlock",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "revokedAtBlock",
            type: "uint256",
          },
        ],
        internalType: "struct IDataPortabilityServersV2.ServerInfo",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
    ],
    name: "getRoleAdmin",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "serverId",
        type: "bytes32",
      },
    ],
    name: "getServer",
    outputs: [
      {
        components: [
          {
            internalType: "bytes32",
            name: "id",
            type: "bytes32",
          },
          {
            internalType: "address",
            name: "ownerAddress",
            type: "address",
          },
          {
            internalType: "address",
            name: "serverAddress",
            type: "address",
          },
          {
            internalType: "string",
            name: "publicKey",
            type: "string",
          },
          {
            internalType: "string",
            name: "serverUrl",
            type: "string",
          },
          {
            internalType: "uint256",
            name: "registeredAtBlock",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "revokedAtBlock",
            type: "uint256",
          },
        ],
        internalType: "struct IDataPortabilityServersV2.ServerInfo",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "grantRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "hasRole",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "trustedForwarderAddress",
        type: "address",
      },
      {
        internalType: "address",
        name: "ownerAddress",
        type: "address",
      },
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "forwarder",
        type: "address",
      },
    ],
    name: "isTrustedForwarder",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "ownerAddress",
        type: "address",
      },
    ],
    name: "ownerServers",
    outputs: [
      {
        components: [
          {
            internalType: "bytes32",
            name: "id",
            type: "bytes32",
          },
          {
            internalType: "address",
            name: "ownerAddress",
            type: "address",
          },
          {
            internalType: "address",
            name: "serverAddress",
            type: "address",
          },
          {
            internalType: "string",
            name: "publicKey",
            type: "string",
          },
          {
            internalType: "string",
            name: "serverUrl",
            type: "string",
          },
          {
            internalType: "uint256",
            name: "registeredAtBlock",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "revokedAtBlock",
            type: "uint256",
          },
        ],
        internalType: "struct IDataPortabilityServersV2.ServerInfo[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "pause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "paused",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "ownerAddress",
            type: "address",
          },
          {
            internalType: "address",
            name: "serverAddress",
            type: "address",
          },
          {
            internalType: "string",
            name: "publicKey",
            type: "string",
          },
          {
            internalType: "string",
            name: "serverUrl",
            type: "string",
          },
        ],
        internalType: "struct IDataPortabilityServersV2.ServerRegistration",
        name: "input",
        type: "tuple",
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes",
      },
    ],
    name: "registerServerWithSignature",
    outputs: [
      {
        internalType: "bytes32",
        name: "serverId",
        type: "bytes32",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "callerConfirmation",
        type: "address",
      },
    ],
    name: "renounceRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "revokeRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "serversCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceId",
        type: "bytes4",
      },
    ],
    name: "supportsInterface",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "trustedForwarder",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "unpause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "trustedForwarderAddress",
        type: "address",
      },
    ],
    name: "updateTrustedForwarder",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "version",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
] as const;

export default DataPortabilityServersABI;
