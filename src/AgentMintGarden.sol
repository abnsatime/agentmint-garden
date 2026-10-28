// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AgentMintGarden is ERC721, Ownable, Pausable, ReentrancyGuard {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 2_000;
    uint256 public constant FREE_SUPPLY = 1_000;
    uint256 public constant MAX_PER_WALLET = 2;

    uint256 public immutable mintPrice;
    uint256 internal _nextTokenId = 1;

    mapping(address account => uint256 quantity) public mintedBy;

    error AgentMintGardenZeroQuantity();
    error AgentMintGardenWalletLimit(uint256 minted, uint256 requested);
    error AgentMintGardenMaxSupply(uint256 currentSupply, uint256 requested);
    error AgentMintGardenIncorrectPayment(uint256 required, uint256 supplied);
    error AgentMintGardenZeroRecipient();
    error AgentMintGardenWithdrawFailed();

    event GardenMinted(
        address indexed minter, uint256 indexed tokenId, bool freeMint, uint256 pricePaid
    );
    event ProceedsWithdrawn(address indexed recipient, uint256 amount);

    constructor(address initialOwner, uint256 paidMintPrice)
        ERC721("AgentMint Garden", "GARDEN")
        Ownable(initialOwner)
    {
        mintPrice = paidMintPrice;
    }

    function totalSupply() public view returns (uint256) {
        return _nextTokenId - 1;
    }

    function quoteMintPrice(uint256 quantity) public view returns (uint256) {
        if (quantity == 0) return 0;

        uint256 supply = totalSupply();
        uint256 freeRemaining = supply < FREE_SUPPLY ? FREE_SUPPLY - supply : 0;
        uint256 paidQuantity = quantity > freeRemaining ? quantity - freeRemaining : 0;
        return paidQuantity * mintPrice;
    }

    function mint(uint256 quantity) external payable nonReentrant whenNotPaused {
        if (quantity == 0) revert AgentMintGardenZeroQuantity();

        uint256 walletMinted = mintedBy[msg.sender];
        if (walletMinted + quantity > MAX_PER_WALLET) {
            revert AgentMintGardenWalletLimit(walletMinted, quantity);
        }

        uint256 supply = totalSupply();
        if (supply + quantity > MAX_SUPPLY) {
            revert AgentMintGardenMaxSupply(supply, quantity);
        }

        uint256 requiredPayment = quoteMintPrice(quantity);
        if (msg.value != requiredPayment) {
            revert AgentMintGardenIncorrectPayment(requiredPayment, msg.value);
        }

        mintedBy[msg.sender] = walletMinted + quantity;

        uint256 firstTokenId = _nextTokenId;
        _nextTokenId += quantity;

        for (uint256 i; i < quantity; ++i) {
            uint256 tokenId = firstTokenId + i;
            bool isFreeMint = tokenId <= FREE_SUPPLY;
            emit GardenMinted(msg.sender, tokenId, isFreeMint, isFreeMint ? 0 : mintPrice);
        }

        for (uint256 i; i < quantity; ++i) {
            uint256 tokenId = firstTokenId + i;
            _safeMint(msg.sender, tokenId);
        }
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdraw(address payable recipient) external nonReentrant onlyOwner {
        if (recipient == address(0)) revert AgentMintGardenZeroRecipient();

        uint256 amount = address(this).balance;
        emit ProceedsWithdrawn(recipient, amount);

        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert AgentMintGardenWithdrawFailed();
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        string memory id = tokenId.toString();
        string memory hue = (uint256(keccak256(abi.encodePacked(tokenId))) % 360).toString();
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">',
            '<rect width="640" height="640" fill="hsl(',
            hue,
            ',70%,18%)"/>',
            '<circle cx="320" cy="300" r="190" fill="none" stroke="#A8FF78" stroke-width="18"/>',
            '<path d="M220 350 Q320 150 420 350 Q320 470 220 350Z" fill="#A8FF78"/>',
            '<text x="320" y="565" text-anchor="middle" fill="white" font-family="monospace" font-size="34">GARDEN #',
            id,
            "</text></svg>"
        );
        string memory json = string.concat(
            '{"name":"AgentMint Garden #',
            id,
            '","description":"A deterministic onchain garden minted on BNB Smart Chain.",',
            '"attributes":[{"trait_type":"Hue","value":"',
            hue,
            '"}],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}
