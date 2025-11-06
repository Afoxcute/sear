// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SearModule = buildModule("SearModule", (m) => {
  // Deploy ERC-6551 Registry (no arguments needed)
  const registry = m.contract("ERC6551Registry");

  // Deploy Account Implementation for ERC-6551
  const accountImplementation = m.contract("ERC6551Account");

  // Deploy Sear contract
  const SearContract = m.contract("Sear", [
    registry,
    accountImplementation,
    5003, // Mantle testnet chain ID
    "0x0000000000000000000000000000000000000000" // Platform fee collector (to be set later)
  ]);

  // Add implementation to registry
  m.call(registry, "addImplementation", [accountImplementation]);

  // Initialize the contract
  m.call(SearContract, "setPlatformFeeCollector", [
    "0x0000000000000000000000000000000000000000"
  ]);

  return { 
    SearContract,
    registry,
    accountImplementation
  };
});

export default SearModule; 