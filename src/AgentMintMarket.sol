// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC721Slim {
    function ownerOf(uint256 tokenId) external view returns (address);

    function getApproved(uint256 tokenId) external view returns (address);

    function isApprovedForAll(address owner, address operator) external view returns (bool);

    function transferFrom(address from, address to, uint256 tokenId) external;

    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

/// @dev The deployment at 0x153bbf8fc8eD31ab8e73d9b5AE3076d73d3424e2 was built before the
/// safeTransferFrom hardening below: it still uses transferFrom, so a contract buyer without
/// onERC721Received can take custody of a token there. Re-deploy to pick this up.
/// @title AgentMint Market
/// @notice Fixed-price listings for one ERC-721 collection.
/// @dev Listings are approvals, not escrow: a listed token stays in the seller's wallet until
/// the moment it sells, so the seller can keep using it (and can revoke approval at any time).
/// The market charges no fee; the whole price goes to the seller in the same transaction.
contract AgentMintMarket is ReentrancyGuard {
    struct Listing {
        address seller;
        uint256 price;
    }

    IERC721Slim public immutable collection;

    mapping(uint256 tokenId => Listing listing) internal _listings;

    error MarketZeroPrice();
    error MarketNotOwner();
    error MarketNotApproved();
    error MarketAlreadyListed();
    error MarketNotListed();
    error MarketNotSeller();
    error MarketSelfPurchase();
    error MarketIncorrectPayment(uint256 required, uint256 supplied);
    error MarketStaleListing();
    error MarketTransferFailed();
    error MarketSellerCannotReceive();

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event PriceUpdated(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event Sold(
        uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price
    );

    constructor(address collectionAddress) {
        collection = IERC721Slim(collectionAddress);
    }

    /// @notice The live listing for a token, or a zeroed struct when it is not listed.
    function listingOf(uint256 tokenId) external view returns (address seller, uint256 price) {
        Listing memory listing = _listings[tokenId];
        return (listing.seller, listing.price);
    }

    /// @notice Puts a token up for a fixed price. The market must already be approved.
    function list(uint256 tokenId, uint256 price) external {
        if (price == 0) revert MarketZeroPrice();
        if (collection.ownerOf(tokenId) != msg.sender) revert MarketNotOwner();
        if (_listings[tokenId].seller != address(0)) revert MarketAlreadyListed();
        if (!_isApprovedForMarket(tokenId, msg.sender)) revert MarketNotApproved();

        _listings[tokenId] = Listing({seller: msg.sender, price: price});
        emit Listed(tokenId, msg.sender, price);
    }

    /// @notice Changes the price of an existing listing. Only the seller may do this.
    function updatePrice(uint256 tokenId, uint256 price) external {
        if (price == 0) revert MarketZeroPrice();

        Listing storage listing = _listings[tokenId];
        if (listing.seller == address(0)) revert MarketNotListed();
        if (listing.seller != msg.sender) revert MarketNotSeller();

        listing.price = price;
        emit PriceUpdated(tokenId, msg.sender, price);
    }

    /// @notice Removes a listing. Only the seller may do this.
    function cancel(uint256 tokenId) external {
        Listing memory listing = _listings[tokenId];
        if (listing.seller == address(0)) revert MarketNotListed();
        if (listing.seller != msg.sender) revert MarketNotSeller();

        delete _listings[tokenId];
        emit Cancelled(tokenId, msg.sender);
    }

    /// @notice Buys a listed token at its exact price.
    /// @dev Checks-effects-interactions: the listing is cleared before the token moves and the
    /// seller is paid, and the guard covers both external calls.
    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory listing = _listings[tokenId];
        if (listing.seller == address(0)) revert MarketNotListed();
        if (msg.sender == listing.seller) revert MarketSelfPurchase();
        if (msg.value != listing.price) {
            revert MarketIncorrectPayment(listing.price, msg.value);
        }
        if (collection.ownerOf(tokenId) != listing.seller) revert MarketStaleListing();

        delete _listings[tokenId];

        // Emitted before the interactions: the state is final here, and a revert anywhere below
        // rolls the log back too, so this cannot fabricate a sale.
        emit Sold(tokenId, listing.seller, msg.sender, listing.price);

        // safeTransferFrom rather than transferFrom: a contract buyer that does not implement
        // onERC721Received would otherwise take custody of a token it can never move again.
        try collection.safeTransferFrom(listing.seller, msg.sender, tokenId) {}
        catch {
            revert MarketTransferFailed();
        }

        // The destination and the amount are the recorded seller and price; the market never
        // holds funds, so this is the only transfer out.
        // forge-lint: disable-next-line(arbitrary-send-eth)
        (bool paid,) = listing.seller.call{value: listing.price}("");
        if (!paid) revert MarketSellerCannotReceive();
    }

    function _isApprovedForMarket(uint256 tokenId, address seller) internal view returns (bool) {
        return collection.getApproved(tokenId) == address(this)
            || collection.isApprovedForAll(seller, address(this));
    }
}
