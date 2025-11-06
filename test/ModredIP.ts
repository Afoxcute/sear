import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "viem";

describe("Sear", function () {
  let sear: any;
  let registry: any;
  let accountImplementation: any;
  let owner: any;
  let creator: any;
  let licensee: any;
  let disputer: any;
  let feeCollector: any;

  const IP_HASH = "QmTestIPHash123456789";
  const METADATA = "QmTestMetadata123456789";
  const LICENSE_TERMS = "QmTestLicenseTerms123456789";

  // We define a fixture to reuse the same setup in every test.
  async function deployContractFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, creator, licensee, disputer, feeCollector] = await hre.viem.getWalletClients();

    // Set block base fee to zero because we want exact calculation checks without network fees
    await hre.network.provider.send("hardhat_setNextBlockBaseFeePerGas", [
      "0x0",
    ]);

    // Deploy ERC-6551 Registry
    const registry = await hre.viem.deployContract("ERC6551Registry", []);

    // Deploy Account Implementation
    const accountImplementation = await hre.viem.deployContract("ERC6551Account", []);

    // Add implementation to registry
    await registry.write.addImplementation([accountImplementation.address]);

    // Deploy Sear
    const sear = await hre.viem.deployContract("ModredIP", [
      registry.address,
      accountImplementation.address,
      5003n, // Mantle testnet chain ID
      feeCollector.account.address
    ]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      sear,
      registry,
      accountImplementation,
      owner,
      creator,
      licensee,
      disputer,
      feeCollector,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { sear, owner } = await loadFixture(deployContractFixture);
      const contractOwner = await sear.read.owner();
      expect(contractOwner.toLowerCase()).to.equal(owner.account.address.toLowerCase());
    });

    it("Should set the correct platform fee collector", async function () {
      const { sear, feeCollector } = await loadFixture(deployContractFixture);
      const collector = await sear.read.platformFeeCollector();
      expect(collector.toLowerCase()).to.equal(feeCollector.account.address.toLowerCase());
    });

    it("Should set the correct platform fee percentage", async function () {
      const { sear } = await loadFixture(deployContractFixture);
      const feePercentage = await sear.read.platformFeePercentage();
      expect(feePercentage).to.equal(250n); // 2.5%
    });
  });

  describe("IP Registration", function () {
    it("Should register a new IP asset", async function () {
      const { sear, creator } = await loadFixture(deployContractFixture);
      
      await sear.write.registerIP([IP_HASH, METADATA, false], {
        account: creator.account.address,
      });
      
      const ipAsset = await sear.read.getIPAsset([1n]);
      
      expect(ipAsset[0].toLowerCase()).to.equal(creator.account.address.toLowerCase());
      expect(ipAsset[1]).to.equal(IP_HASH);
      expect(ipAsset[2]).to.equal(METADATA);
      expect(ipAsset[3]).to.be.false;
      expect(ipAsset[4]).to.be.false;
      expect(ipAsset[7]).to.equal(10000n); // 100%
    });

    it("Should mint NFT to creator", async function () {
      const { sear, creator } = await loadFixture(deployContractFixture);
      
      await sear.write.registerIP([IP_HASH, METADATA, false], {
        account: creator.account.address,
      });
      
      const nftOwner = await sear.read.ownerOf([1n]);
      expect(nftOwner.toLowerCase()).to.equal(creator.account.address.toLowerCase());
    });

    it("Should increment token ID", async function () {
      const { sear, creator } = await loadFixture(deployContractFixture);
      
      await sear.write.registerIP([IP_HASH, METADATA, false], {
        account: creator.account.address,
      });
      await sear.write.registerIP([IP_HASH + "2", METADATA + "2", true], {
        account: creator.account.address,
      });
      
      const nextTokenId = await sear.read.nextTokenId();
      expect(nextTokenId).to.equal(3n);
    });
  });

  describe("License Minting", function () {
    it("Should mint a license", async function () {
      const { sear, creator } = await loadFixture(deployContractFixture);
      
      await sear.write.registerIP([IP_HASH, METADATA, false], {
        account: creator.account.address,
      });
      
      await sear.write.mintLicense([1n, 1000n, 86400n, true, LICENSE_TERMS], {
        account: creator.account.address,
      });
      
      const license = await sear.read.getLicense([1n]);
      
      expect(license[0].toLowerCase()).to.equal(creator.account.address.toLowerCase());
      expect(license[1]).to.equal(1n);
      expect(license[2]).to.equal(1000n); // 10%
      expect(license[3]).to.equal(86400n);
      expect(license[5]).to.be.true;
      expect(license[6]).to.be.true;
      expect(license[7]).to.equal(LICENSE_TERMS);
    });

    it("Should transfer royalty tokens to licensee", async function () {
      const { sear, creator } = await loadFixture(deployContractFixture);
      
      await sear.write.registerIP([IP_HASH, METADATA, false], {
        account: creator.account.address,
      });
      
      await sear.write.mintLicense([1n, 1000n, 86400n, true, LICENSE_TERMS], {
        account: creator.account.address,
      });
      
      const ipAsset = await sear.read.getIPAsset([1n]);
      expect(ipAsset[7]).to.equal(9000n); // 90% remaining
    });

    it("Should fail if royalty percentage too high", async function () {
      const { sear, creator } = await loadFixture(deployContractFixture);
      
      await sear.write.registerIP([IP_HASH, METADATA, false], {
        account: creator.account.address,
      });
      
      await expect(
        sear.write.mintLicense([1n, 15000n, 86400n, true, LICENSE_TERMS], {
          account: creator.account.address,
        })
      ).to.be.rejectedWith("Invalid royalty percentage");
    });
  });

  describe("Revenue Payment", function () {
    it("Should accept revenue payment", async function () {
      const { sear, creator, licensee } = await loadFixture(deployContractFixture);
      
      await sear.write.registerIP([IP_HASH, METADATA, false], {
        account: creator.account.address,
      });
      
      await sear.write.mintLicense([1n, 1000n, 86400n, true, LICENSE_TERMS], {
        account: creator.account.address,
      });
      
      const paymentAmount = parseEther("1.0");
      await sear.write.payRevenue([1n], {
        account: licensee.account.address,
        value: paymentAmount,
      });
      
      const royaltyInfo = await sear.read.getRoyaltyInfo([1n, creator.account.address]);
      expect(royaltyInfo[0]).to.equal(paymentAmount);
    });

    it("Should distribute royalties correctly", async function () {
      const { sear, creator, licensee } = await loadFixture(deployContractFixture);
      
      await sear.write.registerIP([IP_HASH, METADATA, false], {
        account: creator.account.address,
      });
      
      await sear.write.mintLicense([1n, 1000n, 86400n, true, LICENSE_TERMS], {
        account: creator.account.address,
      });
      
      const paymentAmount = parseEther("1.0");
      await sear.write.payRevenue([1n], {
        account: licensee.account.address,
        value: paymentAmount,
      });
      
      const royaltyInfo = await sear.read.getRoyaltyInfo([1n, creator.account.address]);
      expect(royaltyInfo[0]).to.equal(paymentAmount);
      expect(royaltyInfo[3] > 0n).to.be.true;
    });
  });

  describe("Dispute System", function () {
    it("Should allow raising disputes", async function () {
      const { sear, creator, disputer } = await loadFixture(deployContractFixture);
      
      await sear.write.registerIP([IP_HASH, METADATA, false], {
        account: creator.account.address,
      });
      
      await sear.write.raiseDispute([1n, "Potential plagiarism"], {
        account: disputer.account.address,
      });
      
      const dispute = await sear.read.disputes([1n]);
      expect(dispute[0]).to.equal(1n);
      expect(dispute[1]).to.equal(1n);
      expect(dispute[2].toLowerCase()).to.equal(disputer.account.address.toLowerCase());
      expect(dispute[3]).to.equal("Potential plagiarism");
      expect(dispute[5]).to.be.false;
    });

    it("Should mark IP as disputed", async function () {
      const { sear, creator, disputer } = await loadFixture(deployContractFixture);
      
      await sear.write.registerIP([IP_HASH, METADATA, false], {
        account: creator.account.address,
      });
      
      await sear.write.raiseDispute([1n, "Potential plagiarism"], {
        account: disputer.account.address,
      });
      
      const ipAsset = await sear.read.getIPAsset([1n]);
      expect(ipAsset[4]).to.be.true;
    });
  });

  describe("Admin Functions", function () {
    it("Should allow setting platform fee collector", async function () {
      const { sear, owner, licensee } = await loadFixture(deployContractFixture);
      
      await sear.write.setPlatformFeeCollector([licensee.account.address], {
        account: owner.account.address,
      });
      
      const collector = await sear.read.platformFeeCollector();
      expect(collector.toLowerCase()).to.equal(licensee.account.address.toLowerCase());
    });

    it("Should allow setting platform fee percentage", async function () {
      const { sear, owner } = await loadFixture(deployContractFixture);
      
      await sear.write.setPlatformFeePercentage([500n], {
        account: owner.account.address,
      });
      
      const feePercentage = await sear.read.platformFeePercentage();
      expect(feePercentage).to.equal(500n);
    });
  });
}); 