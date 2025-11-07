// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ERC6551Registry.sol";

/**
 * @title ModredIP
 * @dev Intellectual Property management contract with ERC-6551 token-bound accounts
 */
contract ModredIP is ERC721, Ownable, ReentrancyGuard {
    // Constants
    uint256 public constant ROYALTY_DECIMALS = 10000; // 10000 = 100%
    uint256 public constant MINIMUM_LICENSE_DURATION = 1 days;
    uint256 public constant DISPUTE_TIMEOUT = 30 days;
    
    // ERC-6551 Integration
    ERC6551Registry public registry;
    address public accountImplementation;
    uint256 public chainId;
    
    // Platform fees
    address public platformFeeCollector;
    uint256 public platformFeePercentage = 250; // 2.5% (250 basis points)
    
    // Counters
    uint256 public nextTokenId = 1;
    uint256 public nextLicenseId = 1;
    uint256 public nextDisputeId = 1;
    
    // Structs
    struct IPAsset {
        uint256 tokenId;
        address owner;
        string ipHash;
        string metadata;
        bool isEncrypted;
        bool isDisputed;
        uint256 registrationDate;
        uint256 totalRevenue;
        uint256 royaltyTokens; // Remaining royalty tokens (out of ROYALTY_DECIMALS)
    }
    
    struct License {
        uint256 licenseId;
        address licensee;
        uint256 tokenId;
        uint256 royaltyPercentage;
        uint256 duration;
        uint256 startDate;
        bool isActive;
        bool commercialUse;
        string terms;
    }
    
    struct Dispute {
        uint256 disputeId;
        uint256 tokenId;
        address disputer;
        string reason;
        uint256 timestamp;
        bool isResolved;
    }
    
    struct RoyaltyVault {
        uint256 totalAccumulated;
        uint256 lastClaimed;
        mapping(address => uint256) balances;
    }
    
    // Mappings
    mapping(uint256 => IPAsset) public ipAssets;
    mapping(uint256 => License) public licenses;
    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => RoyaltyVault) public royaltyVaults;
    mapping(uint256 => uint256[]) public tokenLicenses; // tokenId => licenseIds
    
    // Events
    event IPRegistered(uint256 indexed tokenId, address indexed owner, string ipHash);
    event LicenseMinted(uint256 indexed licenseId, uint256 indexed tokenId, address indexed licensee);
    event RevenuePaid(uint256 indexed tokenId, uint256 amount);
    event RoyaltyClaimed(uint256 indexed tokenId, address indexed claimant, uint256 amount);
    event DisputeRaised(uint256 indexed disputeId, uint256 indexed tokenId, address indexed disputer);
    event DisputeResolved(uint256 indexed disputeId, uint256 indexed tokenId, bool resolved);
    event IPTransferred(uint256 indexed tokenId, address indexed from, address indexed to);
    
    constructor(
        address _registry,
        address _accountImplementation,
        uint256 _chainId,
        address _platformFeeCollector
    ) ERC721("ModredIP", "MNT") Ownable(msg.sender) {
        registry = ERC6551Registry(_registry);
        accountImplementation = _accountImplementation;
        chainId = _chainId;
        platformFeeCollector = _platformFeeCollector;
    }
    
    /**
     * @dev Register a new IP asset
     */
    function registerIP(
        string memory ipHash,
        string memory metadata,
        bool isEncrypted
    ) public returns (uint256) {
        uint256 tokenId = nextTokenId++;
        
        ipAssets[tokenId] = IPAsset({
            tokenId: tokenId,
            owner: msg.sender,
            ipHash: ipHash,
            metadata: metadata,
            isEncrypted: isEncrypted,
            isDisputed: false,
            registrationDate: block.timestamp,
            totalRevenue: 0,
            royaltyTokens: ROYALTY_DECIMALS // 100% initially
        });
        
        _mint(msg.sender, tokenId);
        emit IPRegistered(tokenId, msg.sender, ipHash);
        
        return tokenId;
    }
    
    /**
     * @dev Mint a license for an IP asset
     */
    function mintLicense(
        uint256 tokenId,
        uint256 royaltyPercentage,
        uint256 duration,
        bool commercialUse,
        string memory terms
    ) public returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(ownerOf(tokenId) == msg.sender, "Only IP owner can mint licenses");
        require(duration >= MINIMUM_LICENSE_DURATION, "Duration too short");
        require(royaltyPercentage <= ipAssets[tokenId].royaltyTokens, "Invalid royalty percentage");
        require(royaltyPercentage <= ROYALTY_DECIMALS / 2, "Royalty cannot exceed 50%");
        
        uint256 licenseId = nextLicenseId++;
        
        licenses[licenseId] = License({
            licenseId: licenseId,
            licensee: msg.sender,
            tokenId: tokenId,
            royaltyPercentage: royaltyPercentage,
            duration: duration,
            startDate: block.timestamp,
            isActive: true,
            commercialUse: commercialUse,
            terms: terms
        });
        
        tokenLicenses[tokenId].push(licenseId);
        ipAssets[tokenId].royaltyTokens -= royaltyPercentage;
        
        emit LicenseMinted(licenseId, tokenId, msg.sender);
        return licenseId;
    }
    
    /**
     * @dev Pay revenue for an IP asset
     */
    function payRevenue(uint256 tokenId) public payable nonReentrant {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(msg.value > 0, "Payment must be greater than 0");
        
        IPAsset storage asset = ipAssets[tokenId];
        address ipOwner = ownerOf(tokenId);
        asset.totalRevenue += msg.value;
        
        // Calculate platform fee
        uint256 platformFee = (msg.value * platformFeePercentage) / ROYALTY_DECIMALS;
        uint256 remainingAmount = msg.value - platformFee;
        
        // Send platform fee
        if (platformFee > 0 && platformFeeCollector != address(0)) {
            (bool feeSuccess, ) = payable(platformFeeCollector).call{value: platformFee}("");
            require(feeSuccess, "Platform fee transfer failed");
        }
        
        // Distribute to license holders
        uint256 totalLicenseeRoyalties = 0;
        uint256[] memory licenseIds = tokenLicenses[tokenId];
        RoyaltyVault storage vault = royaltyVaults[tokenId];
        
        for (uint256 i = 0; i < licenseIds.length; i++) {
            License storage license = licenses[licenseIds[i]];
            if (license.isActive && block.timestamp < license.startDate + license.duration) {
                uint256 royaltyAmount = (remainingAmount * license.royaltyPercentage) / ROYALTY_DECIMALS;
                vault.balances[license.licensee] += royaltyAmount;
                vault.totalAccumulated += royaltyAmount;
                totalLicenseeRoyalties += royaltyAmount;
            }
        }
        
        // Give remaining amount to IP owner (author)
        uint256 ownerRoyalty = remainingAmount - totalLicenseeRoyalties;
        if (ownerRoyalty > 0) {
            vault.balances[ipOwner] += ownerRoyalty;
            vault.totalAccumulated += ownerRoyalty;
        }
        
        emit RevenuePaid(tokenId, msg.value);
    }
    
    /**
     * @dev Claim royalties for a token
     */
    function claimRoyalties(uint256 tokenId) public nonReentrant {
        RoyaltyVault storage vault = royaltyVaults[tokenId];
        uint256 amount = vault.balances[msg.sender];
        require(amount > 0, "No royalties to claim");
        
        vault.balances[msg.sender] = 0;
        vault.lastClaimed = block.timestamp;
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Royalty transfer failed");
        
        emit RoyaltyClaimed(tokenId, msg.sender, amount);
    }
    
    /**
     * @dev Raise a dispute for an IP asset
     */
    function raiseDispute(uint256 tokenId, string memory reason) public {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(!ipAssets[tokenId].isDisputed, "IP already disputed");
        
        uint256 disputeId = nextDisputeId++;
        
        disputes[disputeId] = Dispute({
            disputeId: disputeId,
            tokenId: tokenId,
            disputer: msg.sender,
            reason: reason,
            timestamp: block.timestamp,
            isResolved: false
        });
        
        ipAssets[tokenId].isDisputed = true;
        emit DisputeRaised(disputeId, tokenId, msg.sender);
    }
    
    /**
     * @dev Resolve a dispute (only owner)
     */
    function resolveDispute(uint256 disputeId, bool resolved) public onlyOwner {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.disputeId != 0, "Dispute does not exist");
        require(!dispute.isResolved, "Dispute already resolved");
        
        dispute.isResolved = resolved;
        if (resolved) {
            ipAssets[dispute.tokenId].isDisputed = false;
        }
        
        emit DisputeResolved(disputeId, dispute.tokenId, resolved);
    }
    
    /**
     * @dev Transfer IP ownership
     */
    function transferIP(uint256 tokenId, address to) public {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        require(!ipAssets[tokenId].isDisputed, "Cannot transfer disputed IP");
        
        address from = ownerOf(tokenId);
        _transfer(from, to, tokenId);
        ipAssets[tokenId].owner = to;
        
        emit IPTransferred(tokenId, from, to);
    }
    
    /**
     * @dev Get IP asset details
     */
    function getIPAsset(uint256 tokenId) public view returns (
        address owner_,
        string memory ipHash_,
        string memory metadata_,
        bool isEncrypted_,
        bool isDisputed_,
        uint256 registrationDate_,
        uint256 totalRevenue_,
        uint256 royaltyTokens_
    ) {
        IPAsset storage asset = ipAssets[tokenId];
        return (
            asset.owner,
            asset.ipHash,
            asset.metadata,
            asset.isEncrypted,
            asset.isDisputed,
            asset.registrationDate,
            asset.totalRevenue,
            asset.royaltyTokens
        );
    }
    
    /**
     * @dev Get license details
     */
    function getLicense(uint256 licenseId) public view returns (
        address licensee_,
        uint256 tokenId_,
        uint256 royaltyPercentage_,
        uint256 duration_,
        uint256 startDate_,
        bool isActive_,
        bool commercialUse_,
        string memory terms_
    ) {
        License storage license = licenses[licenseId];
        return (
            license.licensee,
            license.tokenId,
            license.royaltyPercentage,
            license.duration,
            license.startDate,
            license.isActive,
            license.commercialUse,
            license.terms
        );
    }
    
    /**
     * @dev Get royalty information for a token and address
     */
    function getRoyaltyInfo(uint256 tokenId, address claimant) public view returns (
        uint256 totalRevenue_,
        uint256 claimableAmount_,
        uint256 lastClaimed_,
        uint256 totalAccumulated_
    ) {
        IPAsset storage asset = ipAssets[tokenId];
        RoyaltyVault storage vault = royaltyVaults[tokenId];
        
        return (
            asset.totalRevenue,
            vault.balances[claimant],
            vault.lastClaimed,
            vault.totalAccumulated
        );
    }
    
    /**
     * @dev Get IP account address (ERC-6551)
     */
    function getIPAccount(uint256 tokenId) public view returns (address) {
        return registry.account(
            accountImplementation,
            chainId,
            address(this),
            tokenId,
            0
        );
    }
    
    /**
     * @dev Set platform fee collector (only owner)
     */
    function setPlatformFeeCollector(address _platformFeeCollector) public onlyOwner {
        platformFeeCollector = _platformFeeCollector;
    }
    
    /**
     * @dev Set platform fee percentage (only owner)
     */
    function setPlatformFeePercentage(uint256 _platformFeePercentage) public onlyOwner {
        require(_platformFeePercentage <= ROYALTY_DECIMALS, "Fee too high");
        platformFeePercentage = _platformFeePercentage;
    }
    
    /**
     * @dev Override transfer to check for disputes
     */
    function transferFrom(address from, address to, uint256 tokenId) public override {
        if (from != address(0) && to != address(0)) {
            require(!ipAssets[tokenId].isDisputed, "Cannot transfer disputed IP");
        }
        super.transferFrom(from, to, tokenId);
    }
    
    /**
     * @dev Override safeTransferFrom to check for disputes
     */
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override {
        if (from != address(0) && to != address(0)) {
            require(!ipAssets[tokenId].isDisputed, "Cannot transfer disputed IP");
        }
        super.safeTransferFrom(from, to, tokenId, data);
    }
    
    /**
     * @dev Hook called after any token transfer
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        address updated = super._update(to, tokenId, auth);
        
        // Update IP asset owner if token exists
        if (ipAssets[tokenId].tokenId != 0) {
            if (from != address(0) && to != address(0)) {
                ipAssets[tokenId].owner = to;
                emit IPTransferred(tokenId, from, to);
            } else if (to != address(0)) {
                // Mint case
                ipAssets[tokenId].owner = to;
            }
        }
        
        return updated;
    }
    
    /**
     * @dev Get token URI (for NFT metadata)
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return ipAssets[tokenId].metadata;
    }
}
